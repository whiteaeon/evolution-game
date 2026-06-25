import Phaser from "phaser";
import {
  TILE,
  makeBiomeTextures,
  makeDecorTextures,
  makeShelterTextures,
  makeFireTextures,
  ensureHomininTexture,
  type MorphParams,
} from "./textures.js";
import { HOMININ_WALK, homininFrameKey } from "./homininWalk.js";
import {
  ERAS,
  individualName,
  notableById,
  type Biome,
  type Individual,
} from "../sim/index.js";
import type { GameController } from "./controller.js";

/** Camera viewport (the canvas). The world below is several screens wide. */
export const VIEW_W = 640;
export const VIEW_H = 360;
const WORLD_W = 1600;
const WORLD_H = 1120;
const CAMP = { x: WORLD_W / 2, y: WORLD_H / 2 };
const CLEARING_R = 150;

const PLAYER_SPEED = 115; // px/sec
const FOG_CELL = 64;
const FOG_DEPTH = 5000;
const UI_DEPTH = 100000;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The raw resources you can gather and spend. */
type ResKind = "wood" | "food" | "stone";

/** Placeable structures, each with a cost and a perk it grants. */
interface BuildType {
  id: string;
  label: string;
  icon: string; // texture key
  cost: { res: ResKind; amount: number };
}
const BUILD_TYPES: BuildType[] = [
  { id: "campfire", label: "Campfire", icon: "fire-0", cost: { res: "wood", amount: 5 } },
  { id: "hut", label: "Hut", icon: "shelter-hut", cost: { res: "wood", amount: 15 } },
  { id: "farm", label: "Farm", icon: "crop", cost: { res: "food", amount: 8 } },
];

interface Npc {
  ind: Individual;
  sprite: Phaser.GameObjects.Image;
  baseKey: string;
  homeX: number;
  homeY: number;
  tx: number;
  ty: number;
}

/** A harvestable node in the world — a tree, bush, rock or planted crop. */
interface Gatherable {
  sprite: Phaser.GameObjects.Image;
  kind: ResKind;
  amount: number;
}

/**
 * The directly-playable world: you ARE the chieftain. Walk the camp and the
 * wilds (WASD or click-to-move), the camera follows you, fog-of-war lifts as you
 * explore, and clicking a tribe member opens a conversation. The pure evolution
 * {@link Simulation} stays the world's brain (read through {@link GameController});
 * this scene is the body you move through it.
 */
export class WorldScene extends Phaser.Scene {
  private ctrl!: GameController;

  private player!: Phaser.GameObjects.Image;
  private playerKey = "";
  private moveTarget: { x: number; y: number } | null = null;
  private keys!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key[]>;
  private animTimer = 0;
  private animPhase = 0;

  private npcs: Npc[] = [];
  private hoverLabel!: Phaser.GameObjects.Text;

  private fog: Phaser.GameObjects.Rectangle[] = [];
  private fogRevealed: boolean[] = [];

  private dialog!: Phaser.GameObjects.Container;
  private dialogName!: Phaser.GameObjects.Text;
  private dialogBody!: Phaser.GameObjects.Text;
  private dialogOpen = false;

  private hud!: Phaser.GameObjects.Text;

  private buildMode: BuildType | null = null;
  private ghost!: Phaser.GameObjects.Image;
  private buildBtns: { type: BuildType; bg: Phaser.GameObjects.Rectangle }[] = [];

  private solids: { x: number; y: number; r: number }[] = [];
  private gatherables: Gatherable[] = [];
  private gatherKey!: Phaser.Input.Keyboard.Key;
  private gatherPrompt!: Phaser.GameObjects.Text;
  private resHud!: Phaser.GameObjects.Text;
  private housing = 0;

  private npcPhase = 0;
  private npcTimer = 0;
  private objText!: Phaser.GameObjects.Text;
  private objIndex = 0;
  private farmsBuilt = 0;
  private readonly objectives = [
    "Gather wood — walk to a tree and press Space",
    "Build a Hut from the bar (15 wood)",
    "Build a Farm for food (8 food)",
    "Explore the land and talk to your tribe",
  ];

  constructor() {
    super("world");
  }

  create(): void {
    this.ctrl = this.registry.get("controller") as GameController;
    const biome = this.ctrl.sim.state.biome;

    makeBiomeTextures(this);
    makeDecorTextures(this);
    makeShelterTextures(this);
    makeFireTextures(this);

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBackgroundColor("#1d2a17");

    this.paintGround(biome);
    this.buildTerrain(biome);
    this.add.image(CAMP.x, CAMP.y - 6, "shelter-cave").setDepth(CAMP.y);
    if (this.ctrl.sim.state.knowledge.has("fire")) {
      this.add.image(CAMP.x + 2, CAMP.y + 30, "fire-0").setDepth(CAMP.y + 30);
    }

    this.spawnNpcs();
    this.spawnPlayer();
    this.buildFog();
    this.buildHud();
    this.buildDialog();
    this.buildBuildBar();
    this.ghost = this.add
      .image(0, 0, "fire-0")
      .setOrigin(0.5, 0.85)
      .setAlpha(0.55)
      .setDepth(FOG_DEPTH - 1)
      .setVisible(false);

    this.keys = {
      up: [this.key("W"), this.key("UP")],
      down: [this.key("S"), this.key("DOWN")],
      left: [this.key("A"), this.key("LEFT")],
      right: [this.key("D"), this.key("RIGHT")],
    };
    this.gatherKey = this.key("SPACE");

    // One handler does both jobs: a click on a tribe member talks; a click on the
    // ground walks there. `currentlyOver` is every interactive object under the
    // pointer, so we never have to fight event ordering.
    this.input.on(
      "pointerdown",
      (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
        if (this.dialogOpen) {
          this.closeDialog();
          return;
        }
        const btn = currentlyOver.find((o) => o.getData("buildBtn") !== undefined);
        if (btn) {
          this.toggleBuild(btn.getData("buildBtn") as string);
          return;
        }
        if (this.buildMode) {
          this.tryPlace(pointer);
          return;
        }
        const hit = currentlyOver.find((o) => o.getData("npcId") !== undefined);
        if (hit) {
          const id = hit.getData("npcId") as number;
          const npc = this.npcs.find((n) => n.ind.id === id);
          if (npc) this.openDialog(npc.ind);
          return;
        }
        this.moveTarget = { x: pointer.worldX, y: pointer.worldY };
      },
    );
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.updateGhost(p));
    this.input.keyboard!.on("keydown-ESC", () => this.cancelBuild());
  }

  private key(name: string): Phaser.Input.Keyboard.Key {
    return this.input.keyboard!.addKey(name);
  }

  // ── world build ────────────────────────────────────────────────────────────

  private paintGround(biome: Biome): void {
    // Grass is one tiled sprite across the whole world (one draw call); the dirt
    // clearing is a small patch of tiles around camp — not thousands of images.
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, `grass-${biome}`).setOrigin(0, 0).setDepth(0);
    const dirt = this.add.container(0, 0).setDepth(0);
    const span = Math.ceil(CLEARING_R / TILE) + 1;
    const cc = Math.round(CAMP.x / TILE);
    const cr = Math.round(CAMP.y / TILE);
    for (let r = -span; r <= span; r++) {
      for (let c = -span; c <= span; c++) {
        const x = (cc + c) * TILE;
        const y = (cr + r) * TILE;
        if (Phaser.Math.Distance.Between(x + 8, y + 8, CAMP.x, CAMP.y) < CLEARING_R) {
          dirt.add(this.add.image(x, y, `dirt-${biome}`).setOrigin(0, 0));
        }
      }
    }
  }

  private buildTerrain(biome: Biome): void {
    if (biome === "river" || biome === "coast") this.addWater(biome);
    if (biome === "tundra" || biome === "desert") this.addMountains();
    this.scatterFlora(biome);
  }

  /** Impassable water — a winding river inland, or a band of sea on the coast. */
  private addWater(biome: Biome): void {
    const pts: [number, number][] =
      biome === "river"
        ? [[300, 170], [470, 360], [300, 580], [430, 840], [1080, 250], [1240, 520], [1180, 840]]
        : [[1430, 140], [1500, 430], [1450, 710], [1510, 970], [1360, 980]];
    for (const [x, y] of pts) {
      if (Phaser.Math.Distance.Between(x, y, CAMP.x, CAMP.y) < CLEARING_R + 90) continue;
      this.add.ellipse(x, y, 190, 150, 0x3b6ea5, 0.95).setDepth(2);
      this.add.ellipse(x, y, 190, 150).setStrokeStyle(3, 0x2b537d).setDepth(2);
      this.solids.push({ x, y, r: 78 });
    }
  }

  /** Impassable mountains (massive rocks) for the harsh biomes. */
  private addMountains(): void {
    const spots: [number, number][] = [[250, 250], [1320, 300], [680, 900], [1180, 860], [430, 600]];
    for (const [x, y] of spots) {
      if (Phaser.Math.Distance.Between(x, y, CAMP.x, CAMP.y) < CLEARING_R + 90) continue;
      this.add.image(x, y, "rock").setOrigin(0.5, 0.9).setScale(3.2).setDepth(y);
      this.solids.push({ x, y, r: 30 });
    }
  }

  /** Trees (wood), bushes (food) and rocks (stone) scattered as harvestable nodes. */
  private scatterFlora(biome: Biome): void {
    const counts: Record<Biome, [number, number, number]> = {
      tundra: [8, 4, 12],
      forest: [44, 14, 4],
      river: [22, 18, 5],
      grassland: [10, 20, 6],
      desert: [3, 6, 14],
      coast: [12, 14, 8],
    };
    const [trees, bushes, rocks] = counts[biome];
    const treeKey = biome === "tundra" || biome === "forest" ? "pine" : "tree";
    this.placeNodes(treeKey, trees, "wood", 3, 7);
    this.placeNodes("bush", bushes, "food", 2, 0);
    this.placeNodes("rock", rocks, "stone", 2, 7);
  }

  private placeNodes(key: string, n: number, kind: ResKind, amount: number, solidR: number): void {
    let placed = 0;
    let tries = 0;
    while (placed < n && tries++ < n * 40) {
      const x = Phaser.Math.Between(24, WORLD_W - 24);
      const y = Phaser.Math.Between(40, WORLD_H - 20);
      if (Phaser.Math.Distance.Between(x, y, CAMP.x, CAMP.y) < CLEARING_R + 16) continue;
      if (this.solids.some((s) => Phaser.Math.Distance.Between(x, y, s.x, s.y) < s.r + 14)) continue;
      const img = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y);
      if (solidR > 0) this.solids.push({ x, y, r: solidR });
      this.gatherables.push({ sprite: img, kind, amount });
      placed++;
    }
  }

  private morphFor(ind: Individual): MorphParams {
    const eraIdx = ERAS.indexOf(this.ctrl.sim.state.era);
    return {
      eraIdx,
      modernity: clamp01(
        (eraIdx / (ERAS.length - 1)) * 0.6 + ind.genome.intelligence * 0.35 + ind.genome.speech * 0.05,
      ),
      bulk: clamp01(0.25 + ind.genome.strength * 0.6 + ind.genome.coldTolerance * 0.2),
      fur: clamp01(ind.genome.coldTolerance * 0.85),
      skin: ind.id,
      hair: ind.id,
      lineage: ind.lineage,
    };
  }

  private spawnNpcs(): void {
    const living = this.ctrl.sim.living.slice(0, 24);
    living.forEach((ind, idx) => {
      const a = idx * 2.39996;
      const rad = 40 + (idx % 6) * 22;
      const x = Phaser.Math.Clamp(CAMP.x + Math.cos(a) * rad, 40, WORLD_W - 40);
      const y = Phaser.Math.Clamp(CAMP.y + 30 + Math.sin(a) * rad * 0.7, 60, WORLD_H - 40);
      const baseKey = ensureHomininTexture(this, this.morphFor(ind));
      const sprite = this.add
        .image(x, y, baseKey)
        .setOrigin(0.5, 1)
        .setDepth(y)
        .setInteractive({ useHandCursor: true });
      sprite.setData("npcId", ind.id);
      sprite.on("pointerover", () => this.showHover(ind, sprite));
      sprite.on("pointerout", () => this.hoverLabel.setVisible(false));
      this.npcs.push({ ind, sprite, baseKey, homeX: x, homeY: y, tx: x, ty: y });
    });
  }

  private spawnPlayer(): void {
    // A distinctive chieftain: bulky, fur-clad, a touch more upright than the band.
    this.playerKey = ensureHomininTexture(this, {
      eraIdx: ERAS.indexOf(this.ctrl.sim.state.era),
      modernity: 0.55,
      bulk: 0.8,
      fur: 0.5,
      skin: 7,
      hair: 3,
    });
    this.player = this.add
      .image(CAMP.x, CAMP.y + 70, this.playerKey)
      .setOrigin(0.5, 1)
      .setDepth(CAMP.y + 70);
    this.player.setScale(1.15);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
  }

  private buildFog(): void {
    const cols = Math.ceil(WORLD_W / FOG_CELL);
    const rows = Math.ceil(WORLD_H / FOG_CELL);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const rect = this.add
          .rectangle(c * FOG_CELL, r * FOG_CELL, FOG_CELL, FOG_CELL, 0x070a0c, 0.8)
          .setOrigin(0, 0)
          .setDepth(FOG_DEPTH);
        this.fog.push(rect);
        this.fogRevealed.push(false);
      }
    }
  }

  private buildHud(): void {
    this.hud = this.add
      .text(10, 8, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#e9e0c8",
        backgroundColor: "#00000066",
        padding: { x: 6, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH);

    this.resHud = this.add
      .text(10, 30, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#e9e0c8",
        backgroundColor: "#00000066",
        padding: { x: 6, y: 3 },
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH);

    this.gatherPrompt = this.add
      .text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#dff0c0",
        backgroundColor: "#000000aa",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH)
      .setVisible(false);

    this.add
      .text(VIEW_W / 2, 28, "WASD/click move · click a villager · Space to gather · build from the bar", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#cfe0d0",
        backgroundColor: "#00000066",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH);

    this.objText = this.add
      .text(VIEW_W / 2, 8, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffe08a",
        backgroundColor: "#00000088",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH);

    this.hoverLabel = this.add
      .text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#fff4d6",
        backgroundColor: "#000000aa",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(UI_DEPTH)
      .setVisible(false);
  }

  private buildDialog(): void {
    const w = 480;
    const h = 104;
    const x = VIEW_W / 2;
    const y = VIEW_H - 70;
    const panel = this.add.rectangle(0, 0, w, h, 0x141c12, 0.94).setStrokeStyle(2, 0x6f8c5a);
    this.dialogName = this.add
      .text(-w / 2 + 14, -h / 2 + 10, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#ffe08a",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.dialogBody = this.add
      .text(-w / 2 + 14, -h / 2 + 34, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#e9e0c8",
        wordWrap: { width: w - 28 },
        lineSpacing: 3,
      })
      .setOrigin(0, 0);
    const hint = this.add
      .text(w / 2 - 12, h / 2 - 10, "click to close", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#9fb08a",
      })
      .setOrigin(1, 1);
    this.dialog = this.add
      .container(x, y, [panel, this.dialogName, this.dialogBody, hint])
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 1)
      .setVisible(false);
  }

  // ── interaction ──────────────────────────────────────────────────────────

  private showHover(ind: Individual, sprite: Phaser.GameObjects.Image): void {
    this.hoverLabel.setText(individualName(ind)).setVisible(true);
    const cam = this.cameras.main;
    this.hoverLabel.setPosition(sprite.x - cam.scrollX, sprite.y - cam.scrollY - 18);
  }

  private openDialog(ind: Individual): void {
    this.dialogName.setText(individualName(ind));
    this.dialogBody.setText(this.lineFor(ind));
    this.dialog.setVisible(true);
    this.dialogOpen = true;
    this.hoverLabel.setVisible(false);
  }

  private closeDialog(): void {
    this.dialog.setVisible(false);
    this.dialogOpen = false;
  }

  /** A short, in-character line, coloured by who this person is in the sim. */
  private lineFor(ind: Individual): string {
    const notable = notableById(this.ctrl.sim.living).get(ind.id)?.[0];
    const era = this.ctrl.sim.state.era;
    if (notable) {
      return `They call me ${notable.title} — ${notable.detail}. The tribe endures, and so do I.`;
    }
    const top = (Object.keys(ind.genome) as (keyof Individual["genome"])[]).reduce((a, b) =>
      ind.genome[b] > ind.genome[a] ? b : a,
    );
    const byTrait: Record<string, string> = {
      strength: "These hands haul and hunt for the band.",
      intelligence: "I watch the sky and remember what the old ones taught.",
      dexterity: "Give me flint and I'll knap you a fine edge.",
      coldTolerance: "The frost doesn't bite me the way it bites the young.",
      diseaseResistance: "Fever came through camp, and still I stand.",
      speech: "Sit — let me tell you how we came to this place.",
    };
    return `${byTrait[top] ?? "We follow you, chieftain."}  (${era}, age ${ind.age})`;
  }

  // ── building ───────────────────────────────────────────────────────────────

  private buildBuildBar(): void {
    const y = VIEW_H - 44;
    BUILD_TYPES.forEach((t, i) => {
      const bx = 10 + i * 60;
      const bg = this.add
        .rectangle(bx, y, 56, 30, 0x12180e, 0.7)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x6f8c5a)
        .setScrollFactor(0)
        .setDepth(UI_DEPTH)
        .setInteractive({ useHandCursor: true });
      bg.setData("buildBtn", t.id);
      this.add
        .image(bx + 13, y + 15, t.icon)
        .setDisplaySize(16, 16)
        .setScrollFactor(0)
        .setDepth(UI_DEPTH + 1);
      this.add
        .text(bx + 24, y + 5, `${t.label}\n${t.cost.amount} ${t.cost.res}`, {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#e9e0c8",
          lineSpacing: 2,
        })
        .setScrollFactor(0)
        .setDepth(UI_DEPTH + 1);
      this.buildBtns.push({ type: t, bg });
    });
  }

  private toggleBuild(id: string): void {
    const t = BUILD_TYPES.find((b) => b.id === id);
    if (!t) return;
    if (this.buildMode?.id === id) {
      this.cancelBuild();
      return;
    }
    this.buildMode = t;
    this.ghost.setTexture(t.icon).setVisible(true);
    this.highlightBuildBtns();
  }

  private cancelBuild(): void {
    this.buildMode = null;
    this.ghost.setVisible(false);
    this.highlightBuildBtns();
  }

  private highlightBuildBtns(): void {
    for (const b of this.buildBtns) {
      const on = b.type.id === this.buildMode?.id;
      b.bg.setStrokeStyle(on ? 2 : 1, on ? 0xffe08a : 0x6f8c5a);
    }
  }

  private snap(v: number): number {
    return Math.floor(v / TILE) * TILE + TILE / 2;
  }

  private updateGhost(p: Phaser.Input.Pointer): void {
    if (!this.buildMode) return;
    this.ghost.setPosition(this.snap(p.worldX), this.snap(p.worldY));
    const cost = this.buildMode.cost;
    const ok = this.ctrl.sim.state.resources[cost.res] >= cost.amount;
    this.ghost.setTint(ok ? 0x88ff88 : 0xff7a7a);
  }

  private tryPlace(p: Phaser.Input.Pointer): void {
    const t = this.buildMode;
    if (!t) return;
    const res = this.ctrl.sim.state.resources;
    if (res[t.cost.res] < t.cost.amount) {
      this.flash(`Not enough ${t.cost.res}`);
      return;
    }
    res[t.cost.res] -= t.cost.amount;
    const wx = this.snap(p.worldX);
    const wy = this.snap(p.worldY);
    if (t.id === "farm") {
      // A farm is flat ground you walk over — and a renewable food source.
      const crop = this.add.image(wx, wy, "crop").setDepth(2);
      this.gatherables.push({ sprite: crop, kind: "food", amount: 12 });
      this.farmsBuilt += 1;
      this.flash("Farm built — Space to harvest food");
    } else {
      this.add.image(wx, wy, t.icon).setOrigin(0.5, 0.9).setDepth(wy);
      if (t.id === "hut") {
        this.housing += 1; // shelter for more of the tribe
        this.solids.push({ x: wx, y: wy, r: 10 });
        this.flash("Hut built — +1 housing");
      } else {
        this.add.ellipse(wx, wy, 72, 42, 0xffb066, 0.18).setDepth(1); // campfire's warm glow
        this.flash("Campfire built — warmth");
      }
    }
    this.updateGhost(p); // refresh the affordability tint after spending
  }

  private flash(msg: string): void {
    const txt = this.add
      .text(VIEW_W / 2, 64, msg, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#fff4d6",
        backgroundColor: "#000000aa",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 5);
    this.tweens.add({
      targets: txt,
      y: 44,
      alpha: 0,
      duration: 1300,
      ease: "Sine.easeOut",
      onComplete: () => txt.destroy(),
    });
  }

  // ── per-frame ──────────────────────────────────────────────────────────────

  override update(_t: number, dt: number): void {
    this.ctrl.update(dt); // keeps the world model alive (no-op while paused)
    this.movePlayer(dt);
    this.wanderNpcs(dt);
    this.updateGather();
    this.updateObjective();
    this.revealFog();
    this.syncHud();
  }

  /** Gentle idle wandering so the camp feels alive even before time is running. */
  private wanderNpcs(dt: number): void {
    this.npcTimer += dt;
    if (this.npcTimer > 220) {
      this.npcTimer = 0;
      this.npcPhase = (this.npcPhase + 1) & 3;
    }
    const speed = (16 * dt) / 1000;
    this.npcs.forEach((n, i) => {
      const s = n.sprite;
      const dx = n.tx - s.x;
      const dy = n.ty - s.y;
      const d = Math.hypot(dx, dy);
      if (d < 3) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 55;
        n.tx = Phaser.Math.Clamp(n.homeX + Math.cos(a) * r, 30, WORLD_W - 30);
        n.ty = Phaser.Math.Clamp(n.homeY + Math.sin(a) * r, 50, WORLD_H - 20);
        if (s.texture.key !== n.baseKey) s.setTexture(n.baseKey);
        return;
      }
      s.x += (dx / d) * speed;
      s.y += (dy / d) * speed;
      s.setDepth(s.y);
      s.setFlipX(dx < 0);
      const pose = HOMININ_WALK[(this.npcPhase + i) & 3];
      const fk = homininFrameKey(n.baseKey, pose);
      if (s.texture.key !== fk) s.setTexture(fk);
    });
  }

  private objectiveComplete(i: number): boolean {
    const r = this.ctrl.sim.state.resources;
    if (i === 0) return r.wood >= 15;
    if (i === 1) return this.housing >= 1;
    if (i === 2) return this.farmsBuilt >= 1;
    return false;
  }

  private updateObjective(): void {
    if (this.objIndex < this.objectives.length - 1 && this.objectiveComplete(this.objIndex)) {
      this.objIndex++;
      this.flash("Objective complete!");
    }
    this.objText.setText("◆ " + this.objectives[this.objIndex]);
  }

  private blocked(x: number, y: number): boolean {
    const r = 7; // player half-width at the feet
    return this.solids.some((s) => Phaser.Math.Distance.Between(x, y, s.x, s.y) < s.r + r);
  }

  // ── gathering ────────────────────────────────────────────────────────────

  private updateGather(): void {
    const node = this.nearestGatherable(34);
    if (!node) {
      this.gatherPrompt.setVisible(false);
      return;
    }
    const cam = this.cameras.main;
    this.gatherPrompt
      .setText(`Space: gather ${node.kind}`)
      .setPosition(node.sprite.x - cam.scrollX, node.sprite.y - cam.scrollY - node.sprite.displayHeight)
      .setVisible(true);
    if (Phaser.Input.Keyboard.JustDown(this.gatherKey)) this.gather(node);
  }

  private nearestGatherable(range: number): Gatherable | null {
    let best: Gatherable | null = null;
    let bestD = range;
    for (const g of this.gatherables) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, g.sprite.x, g.sprite.y);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    return best;
  }

  private gather(node: Gatherable): void {
    this.ctrl.sim.state.resources[node.kind] += 1;
    node.amount -= 1;
    this.flash(`+1 ${node.kind}`);
    this.tweens.add({ targets: node.sprite, y: node.sprite.y - 3, yoyo: true, duration: 90 });
    if (node.amount <= 0) {
      const spr = node.sprite;
      this.tweens.add({ targets: spr, alpha: 0, duration: 300, onComplete: () => spr.destroy() });
      this.gatherables = this.gatherables.filter((g) => g !== node);
    }
  }

  private movePlayer(dt: number): void {
    const sec = dt / 1000;
    let dx = 0;
    let dy = 0;
    const down = (ks: Phaser.Input.Keyboard.Key[]) => ks.some((k) => k.isDown);
    if (down(this.keys.left)) dx -= 1;
    if (down(this.keys.right)) dx += 1;
    if (down(this.keys.up)) dy -= 1;
    if (down(this.keys.down)) dy += 1;

    if (dx || dy) this.moveTarget = null; // keys override a click destination
    else if (this.moveTarget) {
      const tdx = this.moveTarget.x - this.player.x;
      const tdy = this.moveTarget.y - this.player.y;
      if (Math.hypot(tdx, tdy) < 4) this.moveTarget = null;
      else {
        dx = tdx;
        dy = tdy;
      }
    }

    const len = Math.hypot(dx, dy);
    const moving = len > 0.001;
    if (moving) {
      const step = PLAYER_SPEED * sec;
      const ux = dx / len;
      const uy = dy / len;
      // Try the straight path, then progressively wider angles, so click-to-move
      // routes around a tree/rock instead of jamming into it.
      for (const a of [0, 0.4, -0.4, 0.9, -0.9, 1.4, -1.4]) {
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const rx = ux * cos - uy * sin;
        const ry = ux * sin + uy * cos;
        const nx = Phaser.Math.Clamp(this.player.x + rx * step, 12, WORLD_W - 12);
        const ny = Phaser.Math.Clamp(this.player.y + ry * step, 40, WORLD_H - 12);
        if (!this.blocked(nx, ny)) {
          this.player.x = nx;
          this.player.y = ny;
          if (Math.abs(rx) > 0.3) this.player.setFlipX(rx < 0);
          break;
        }
      }
      this.player.setDepth(this.player.y);

      this.animTimer += dt;
      if (this.animTimer > 120) {
        this.animTimer = 0;
        this.animPhase = (this.animPhase + 1) & 3;
      }
      const pose = HOMININ_WALK[this.animPhase];
      const fk = homininFrameKey(this.playerKey, pose);
      if (this.player.texture.key !== fk) this.player.setTexture(fk);
    } else if (this.player.texture.key !== this.playerKey) {
      this.player.setTexture(this.playerKey); // settle on the standing pose
    }
  }

  private revealFog(): void {
    const px = this.player.x;
    const py = this.player.y;
    const reach = 150;
    const cols = Math.ceil(WORLD_W / FOG_CELL);
    for (let i = 0; i < this.fog.length; i++) {
      if (this.fogRevealed[i]) continue;
      const cx = (i % cols) * FOG_CELL + FOG_CELL / 2;
      const cy = Math.floor(i / cols) * FOG_CELL + FOG_CELL / 2;
      if (Phaser.Math.Distance.Between(px, py, cx, cy) < reach) {
        this.fogRevealed[i] = true;
        this.tweens.add({ targets: this.fog[i], alpha: 0, duration: 350 });
      }
    }
  }

  private syncHud(): void {
    const s = this.ctrl.sim.state;
    this.hud.setText(`${s.era}   👥 ${this.ctrl.sim.living.length}   ${s.biome}`);
    const r = s.resources;
    this.resHud.setText(
      `🍖 ${Math.floor(r.food)}   🪵 ${Math.floor(r.wood)}   🪨 ${Math.floor(r.stone)}   🏠 ${this.housing}`,
    );
  }
}
