import Phaser from "phaser";
import { RNG } from "../sim/rng.js";
import { ERAS, type Biome, type Individual } from "../sim/index.js";
import type { GameController } from "./controller.js";
import {
  TILE,
  makeBiomeTextures,
  makeDecorTextures,
  makeAnimalTextures,
  makeShelterTextures,
  makeFireTextures,
  ensureHomininTexture,
  type MorphParams,
} from "./textures.js";

const WORLD_W = 640;
const WORLD_H = 360;
const CAMP = { x: 322, y: 196 };
const CLEARING_R = 96;
const MAX_SPRITES = 40;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const DECOR_BY_BIOME: Record<Biome, string[]> = {
  tundra: ["pine", "pine", "rock"],
  forest: ["tree", "tree", "pine", "bush"],
  river: ["tree", "tree", "bush"],
  grassland: ["bush", "tree", "rock"],
  desert: ["rock", "rock", "bush"],
  coast: ["bush", "tree", "rock"],
};

// Light, biome-appropriate ambience. tundra is left bare — the snow overlay
// already supplies its drifting motes.
type AmbienceKind = "none" | "dust" | "leaves" | "spray";

const AMBIENCE_BY_BIOME: Record<Biome, AmbienceKind> = {
  tundra: "none",
  forest: "leaves",
  river: "leaves",
  grassland: "dust",
  desert: "dust",
  coast: "spray",
};

interface AmbienceCfg {
  count: number; // hard cap on particles for this kind
  colors: number[];
  size: [number, number];
  alpha: number;
  vx: [number, number]; // px/frame at ~60fps, scaled by dt
  vy: [number, number];
  sway: number; // horizontal wobble amplitude
}

const AMBIENCE_CFG: Record<Exclude<AmbienceKind, "none">, AmbienceCfg> = {
  dust: { count: 22, colors: [0xe8d4a0, 0xd8c090, 0xf0e4c0], size: [1, 2], alpha: 0.5, vx: [0.6, 1.6], vy: [-0.2, 0.2], sway: 0.05 },
  leaves: { count: 16, colors: [0x6f9c3d, 0x4f7a2a, 0xb07a2a], size: [2, 3], alpha: 0.7, vx: [-0.5, 0.5], vy: [0.4, 1.0], sway: 0.25 },
  spray: { count: 18, colors: [0xeaf4ff, 0xcfe6f5, 0xffffff], size: [1, 2], alpha: 0.55, vx: [-1.4, -0.5], vy: [-0.3, 0.3], sway: 0.12 },
};

interface AmbientParticle {
  obj: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  sway: number;
  phase: number;
}

interface TribeView {
  sprite: Phaser.GameObjects.Image;
  anchorX: number;
  anchorY: number;
  tx: number;
  ty: number;
  morph: string;
}

export class MainScene extends Phaser.Scene {
  private ctrl!: GameController;
  private rng = new RNG(99);

  private ground!: Phaser.GameObjects.Container;
  private decor!: Phaser.GameObjects.Container;
  private farm!: Phaser.GameObjects.Container;
  private animals!: Phaser.GameObjects.Container;
  private shelter!: Phaser.GameObjects.Image;
  private hearth!: Phaser.GameObjects.Image;
  private nightOverlay!: Phaser.GameObjects.Rectangle;
  private coldOverlay!: Phaser.GameObjects.Rectangle;
  private warmOverlay!: Phaser.GameObjects.Rectangle;
  private snowLayer!: Phaser.GameObjects.Container;
  private ambienceLayer!: Phaser.GameObjects.Container;
  private ambience: AmbientParticle[] = [];
  private ambienceKind: AmbienceKind = "none";

  private tribe = new Map<number, TribeView>();
  private spritePool: Phaser.GameObjects.Image[] = [];
  private foodPool: Phaser.GameObjects.Image[] = [];

  private currentBiome: Biome | null = null;
  private clock = 0;
  private fireTimer = 0;
  private walkTimer = 0;
  private walkPhase = 0;
  private lastLogLen = 0;

  constructor() {
    super("main");
  }

  create(): void {
    this.ctrl = this.registry.get("controller") as GameController;
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    makeBiomeTextures(this);
    makeDecorTextures(this);
    makeAnimalTextures(this);
    makeShelterTextures(this);
    makeFireTextures(this);

    this.ground = this.add.container(0, 0).setDepth(0);
    this.decor = this.add.container(0, 0);
    this.farm = this.add.container(0, 0).setDepth(1);
    this.animals = this.add.container(0, 0);

    this.shelter = this.add.image(CAMP.x, CAMP.y - 6, "shelter-cave").setDepth(CAMP.y);
    this.hearth = this.add.image(CAMP.x + 2, CAMP.y + 36, "fire-0").setDepth(CAMP.y + 36).setVisible(false);

    this.ambienceLayer = this.add.container(0, 0).setDepth(905);
    this.warmOverlay = this.add.rectangle(0, 0, WORLD_W, WORLD_H, 0xffb066, 0).setOrigin(0, 0).setDepth(945);
    this.snowLayer = this.add.container(0, 0).setDepth(900);
    this.coldOverlay = this.add.rectangle(0, 0, WORLD_W, WORLD_H, 0xbcd6ff, 0).setOrigin(0, 0).setDepth(950);
    this.nightOverlay = this.add.rectangle(0, 0, WORLD_W, WORLD_H, 0x0b1437, 0).setOrigin(0, 0).setDepth(960);
    this.buildSnow();

    this.rebuildWorld(this.ctrl.sim.state.biome);
  }

  /** (Re)paint ground + scenery for a biome. Called on biome change. */
  private rebuildWorld(biome: Biome): void {
    this.currentBiome = biome;
    this.rng = new RNG(99); // deterministic layout per biome
    this.ground.removeAll(true);
    this.decor.removeAll(true);

    const cols = Math.ceil(WORLD_W / TILE);
    const rows = Math.ceil(WORLD_H / TILE);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * TILE;
        const y = r * TILE;
        const d = Phaser.Math.Distance.Between(x + 8, y + 8, CAMP.x, CAMP.y);
        const key = d < CLEARING_R ? `dirt-${biome}` : `grass-${biome}`;
        this.ground.add(this.add.image(x, y, key).setOrigin(0, 0));
      }
    }

    const kinds = DECOR_BY_BIOME[biome];
    let placed = 0;
    let tries = 0;
    const density = biome === "desert" ? 14 : 26;
    while (placed < density && tries++ < 400) {
      const x = this.rng.int(12, WORLD_W - 12);
      const y = this.rng.int(20, WORLD_H - 12);
      if (Phaser.Math.Distance.Between(x, y, CAMP.x, CAMP.y) < CLEARING_R + 14) continue;
      const img = this.add.image(x, y, this.rng.pick(kinds)).setOrigin(0.5, 1).setDepth(y);
      this.decor.add(img);
      placed++;
    }

    this.buildAmbience(biome);
  }

  /** (Re)create the capped biome ambience particles. Called on biome change. */
  private buildAmbience(biome: Biome): void {
    this.ambienceLayer.removeAll(true);
    this.ambience = [];
    this.ambienceKind = AMBIENCE_BY_BIOME[biome];
    this.warmOverlay.setFillStyle(0xffb066, 0); // reset; desert shimmer set per-frame
    if (this.ambienceKind === "none") return;

    const cfg = AMBIENCE_CFG[this.ambienceKind];
    for (let i = 0; i < cfg.count; i++) {
      const size = this.rng.int(cfg.size[0], cfg.size[1]);
      const obj = this.add
        .rectangle(this.rng.int(0, WORLD_W), this.rng.int(0, WORLD_H), size, size, this.rng.pick(cfg.colors), cfg.alpha)
        .setOrigin(0, 0);
      this.ambienceLayer.add(obj);
      this.ambience.push({
        obj,
        vx: this.rng.range(cfg.vx[0], cfg.vx[1]),
        vy: this.rng.range(cfg.vy[0], cfg.vy[1]),
        sway: cfg.sway * (0.5 + this.rng.next()),
        phase: this.rng.next() * Math.PI * 2,
      });
    }
  }

  private buildSnow(): void {
    for (let i = 0; i < 40; i++) {
      const f = this.add
        .rectangle(this.rng.int(0, WORLD_W), this.rng.int(0, WORLD_H), 2, 2, 0xffffff, 0.85)
        .setOrigin(0, 0);
      this.snowLayer.add(f);
    }
    this.snowLayer.setAlpha(0);
  }

  // ── per-frame ────────────────────────────────────────────────────────────

  override update(_t: number, dt: number): void {
    this.ctrl.update(dt);
    const s = this.ctrl.sim.state;

    if (s.biome !== this.currentBiome) this.rebuildWorld(s.biome);
    this.syncShelter(s.shelter);
    this.syncHearth(s.knowledge.has("fire"), dt);
    this.syncFarm(s.knowledge.has("agriculture"));
    this.syncAnimals(s.knowledge.has("animalDomestication"));
    this.syncFood(s.resources.food);
    this.syncTribe(dt);
    this.syncWeather(s.world.cold, dt);
    this.syncEvents();
  }

  private syncShelter(shelter: string): void {
    const key = `shelter-${shelter}`;
    if (this.shelter.texture.key !== key && this.textures.exists(key)) this.shelter.setTexture(key);
  }

  private syncHearth(hasFire: boolean, dt: number): void {
    this.hearth.setVisible(hasFire);
    if (!hasFire) return;
    this.fireTimer += dt;
    if (this.fireTimer > 220) {
      this.fireTimer = 0;
      this.hearth.setTexture(this.hearth.texture.key === "fire-0" ? "fire-1" : "fire-0");
    }
  }

  private syncFarm(hasAg: boolean): void {
    if (hasAg === this.farm.getData("on")) return;
    this.farm.setData("on", hasAg);
    this.farm.removeAll(true);
    if (!hasAg) return;
    // a tidy field of crop tiles to one side of camp
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        this.farm.add(this.add.image(CAMP.x - 150 + c * TILE, CAMP.y + 8 + r * TILE, "crop").setOrigin(0, 0));
      }
    }
  }

  private syncAnimals(hasAnimals: boolean): void {
    if (hasAnimals === this.animals.getData("on")) return;
    this.animals.setData("on", hasAnimals);
    this.animals.removeAll(true);
    if (!hasAnimals) return;
    const spots: [string, number, number][] = [
      ["dog", CAMP.x + 40, CAMP.y + 20],
      ["sheep", CAMP.x + 120, CAMP.y + 40],
      ["sheep", CAMP.x + 140, CAMP.y + 28],
      ["cow", CAMP.x + 100, CAMP.y + 56],
    ];
    for (const [key, x, y] of spots) this.animals.add(this.add.image(x, y, key).setDepth(y));
  }

  private syncFood(food: number): void {
    const want = Math.min(6, Math.floor(food / 9));
    for (let i = 0; i < 6; i++) {
      let pile = this.foodPool[i];
      if (!pile) {
        const angle = (i / 6) * Math.PI * 2;
        const x = CAMP.x + Math.cos(angle) * 54 + 20;
        const y = CAMP.y + Math.sin(angle) * 30 + 40;
        pile = this.add.image(x, y, i % 2 ? "food-berry" : "food-meat").setDepth(y);
        this.foodPool[i] = pile;
      }
      pile.setVisible(i < want);
    }
  }

  private morphFor(ind: Individual): MorphParams {
    const eraIdx = ERAS.indexOf(this.ctrl.sim.state.era);
    return {
      eraIdx,
      modernity: clamp01((eraIdx / (ERAS.length - 1)) * 0.6 + ind.genome.intelligence * 0.35 + ind.genome.speech * 0.05),
      bulk: clamp01(0.25 + ind.genome.strength * 0.6 + ind.genome.coldTolerance * 0.2),
      fur: clamp01(ind.genome.coldTolerance * 0.85),
      skin: ind.id,
      hair: ind.id,
      lineage: ind.lineage,
    };
  }

  private syncTribe(dt: number): void {
    this.walkTimer += dt;
    if (this.walkTimer > 260) {
      this.walkTimer = 0;
      this.walkPhase ^= 1; // flip the global walk-cycle frame
    }

    const living = this.ctrl.sim.living;
    const shown = living.slice(0, MAX_SPRITES);
    const seen = new Set<number>();

    shown.forEach((ind, idx) => {
      seen.add(ind.id);
      const key = ensureHomininTexture(this, this.morphFor(ind));

      let view = this.tribe.get(ind.id);
      if (!view) {
        const a = idx * 2.39996;
        const rad = 22 + (idx % 6) * 12;
        const anchorX = Phaser.Math.Clamp(CAMP.x + Math.cos(a) * rad, 30, WORLD_W - 30);
        const anchorY = Phaser.Math.Clamp(CAMP.y + 26 + Math.sin(a) * rad * 0.6, 60, WORLD_H - 20);
        const sprite = this.acquireSprite(anchorX, anchorY, key);
        view = { sprite, anchorX, anchorY, tx: anchorX, ty: anchorY, morph: key };
        this.tribe.set(ind.id, view);
      }
      view.morph = key;
      // 2-frame walk; stagger by index so the tribe doesn't step in lockstep.
      const frameKey = (this.walkPhase + idx) & 1 ? `${key}_1` : key;
      if (view.sprite.texture.key !== frameKey) view.sprite.setTexture(frameKey);

      const childScale = ind.age < this.ctrl.sim.config.reproMinAge ? 0.55 + (ind.age / 15) * 0.45 : 1;
      view.sprite.setScale(Math.min(1, childScale));

      if (Phaser.Math.Distance.Between(view.sprite.x, view.sprite.y, view.tx, view.ty) < 2) {
        view.tx = Phaser.Math.Clamp(view.anchorX + (Math.random() - 0.5) * 36, 24, WORLD_W - 24);
        view.ty = Phaser.Math.Clamp(view.anchorY + (Math.random() - 0.5) * 24, 56, WORLD_H - 16);
      }
      view.sprite.x += Phaser.Math.Clamp(view.tx - view.sprite.x, -0.35, 0.35);
      view.sprite.y += Phaser.Math.Clamp(view.ty - view.sprite.y, -0.3, 0.3);
      view.sprite.setDepth(view.sprite.y);
      view.sprite.setFlipX(view.tx < view.sprite.x);
      view.sprite.setAlpha(0.55 + ind.health * 0.45);
    });

    for (const [id, view] of this.tribe) {
      if (!seen.has(id)) {
        this.releaseSprite(view.sprite);
        this.tribe.delete(id);
      }
    }
  }

  /** Reuse a pooled hominin image (or create one) instead of churning create/destroy. */
  private acquireSprite(x: number, y: number, key: string): Phaser.GameObjects.Image {
    const sprite = this.spritePool.pop();
    if (sprite) {
      sprite.setTexture(key).setPosition(x, y).setDepth(y).setVisible(true);
      return sprite;
    }
    return this.add.image(x, y, key).setDepth(y);
  }

  /** Return a hominin image to the pool (hidden) rather than destroying it. */
  private releaseSprite(sprite: Phaser.GameObjects.Image): void {
    sprite.setVisible(false);
    this.spritePool.push(sprite);
  }

  private syncWeather(cold: number, dt: number): void {
    this.clock += dt;
    const phase = (this.clock / 26000) % 1;
    const night = Math.max(0, Math.cos(phase * Math.PI * 2)) ** 1.5;
    this.nightOverlay.setFillStyle(0x0b1437, night * 0.5);

    this.coldOverlay.setFillStyle(0xbcd6ff, clamp01(cold) * 0.4);
    const snowVis = clamp01((cold - 0.4) * 2.2);
    this.snowLayer.setAlpha(snowVis * 0.9);
    if (snowVis > 0) {
      for (const f of this.snowLayer.list as Phaser.GameObjects.Rectangle[]) {
        f.y += 0.25 + dt * 0.02;
        f.x += 0.1;
        if (f.y > WORLD_H) f.y = -2;
        if (f.x > WORLD_W) f.x = 0;
      }
    }

    this.syncAmbience(dt, night, snowVis);
  }

  /** Drift the biome ambience particles, fading them out at night and under snow. */
  private syncAmbience(dt: number, night: number, snowVis: number): void {
    // Heat-shimmer tint over the desert, gently pulsing and gone after dark.
    const desert = this.currentBiome === "desert";
    const shimmer = desert ? (0.04 + 0.03 * (0.5 + 0.5 * Math.sin(this.clock * 0.0008))) * (1 - night) : 0;
    this.warmOverlay.setFillStyle(0xffb066, shimmer);

    if (this.ambienceKind === "none") {
      this.ambienceLayer.setAlpha(0);
      return;
    }
    const vis = clamp01(1 - night * 0.7) * (1 - snowVis);
    this.ambienceLayer.setAlpha(vis);
    if (vis <= 0.01) return;

    const f = dt * 0.06;
    for (const p of this.ambience) {
      p.phase += dt * 0.004;
      p.obj.x += p.vx * f + Math.sin(p.phase) * p.sway;
      p.obj.y += p.vy * f;
      if (p.obj.x > WORLD_W) p.obj.x = -2;
      else if (p.obj.x < -2) p.obj.x = WORLD_W;
      if (p.obj.y > WORLD_H) p.obj.y = -2;
      else if (p.obj.y < -2) p.obj.y = WORLD_H;
    }
  }

  private syncEvents(): void {
    const log = this.ctrl.sim.state.log;
    if (log.length <= this.lastLogLen) {
      this.lastLogLen = log.length;
      return;
    }
    const ev = log[log.length - 1];
    this.lastLogLen = log.length;
    const tint =
      ev.type === "bounty" || ev.type === "discovery" || ev.type === "milestone"
        ? "#ffe08a"
        : ev.type === "disease"
          ? "#a8e0a0"
          : ev.type === "encounter"
            ? "#c9b3ff"
            : "#ff9a8a";
    const label = this.add
      .text(CAMP.x, CAMP.y - 30, ev.message, {
        fontFamily: "monospace",
        fontSize: "11px",
        color: tint,
        backgroundColor: "#000000aa",
        padding: { x: 4, y: 2 },
        align: "center",
        wordWrap: { width: 260 },
      })
      .setOrigin(0.5)
      .setDepth(2000);
    this.tweens.add({
      targets: label,
      y: CAMP.y - 70,
      alpha: 0,
      duration: 3000,
      ease: "Sine.easeOut",
      onComplete: () => label.destroy(),
    });
  }
}

export { WORLD_W, WORLD_H };
