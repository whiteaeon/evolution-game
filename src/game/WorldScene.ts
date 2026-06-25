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

const DECOR_BY_BIOME: Record<Biome, string[]> = {
  tundra: ["pine", "pine", "rock"],
  forest: ["tree", "tree", "pine", "bush"],
  river: ["tree", "tree", "bush"],
  grassland: ["bush", "tree", "rock"],
  desert: ["rock", "rock", "bush"],
  coast: ["bush", "tree", "rock"],
};

/** Placeable structures. Cost is paid from the tribe's food stores for now. */
interface BuildType {
  id: string;
  label: string;
  icon: string; // texture key
  cost: number; // food
}
const BUILD_TYPES: BuildType[] = [
  { id: "campfire", label: "Campfire", icon: "fire-0", cost: 4 },
  { id: "hut", label: "Hut", icon: "shelter-hut", cost: 12 },
  { id: "farm", label: "Farm", icon: "crop", cost: 8 },
];

interface Npc {
  ind: Individual;
  sprite: Phaser.GameObjects.Image;
  baseKey: string;
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
    this.scatterDecor(biome);
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

  private scatterDecor(biome: Biome): void {
    const kinds = DECOR_BY_BIOME[biome];
    let placed = 0;
    let tries = 0;
    const target = 150;
    while (placed < target && tries++ < 4000) {
      const x = Phaser.Math.Between(12, WORLD_W - 12);
      const y = Phaser.Math.Between(20, WORLD_H - 12);
      if (Phaser.Math.Distance.Between(x, y, CAMP.x, CAMP.y) < CLEARING_R + 10) continue;
      const img = this.add
        .image(x, y, Phaser.Utils.Array.GetRandom(kinds))
        .setOrigin(0.5, 1)
        .setDepth(y);
      img.setData("solid", true);
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
        .setDepth(y)
        .setInteractive({ useHandCursor: true });
      sprite.setData("npcId", ind.id);
      sprite.on("pointerover", () => this.showHover(ind, sprite));
      sprite.on("pointerout", () => this.hoverLabel.setVisible(false));
      this.npcs.push({ ind, sprite, baseKey });
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
    this.player = this.add.image(CAMP.x, CAMP.y + 70, this.playerKey).setDepth(CAMP.y + 70);
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

    this.add
      .text(VIEW_W / 2, 28, "WASD / click to move  ·  click a villager to talk  ·  build from the bar (Esc cancels)", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#cfe0d0",
        backgroundColor: "#00000066",
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
        .text(bx + 24, y + 5, `${t.label}\n${t.cost} food`, {
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
    const ok = this.ctrl.sim.state.resources.food >= this.buildMode.cost;
    this.ghost.setTint(ok ? 0x88ff88 : 0xff7a7a);
  }

  private tryPlace(p: Phaser.Input.Pointer): void {
    const t = this.buildMode;
    if (!t) return;
    if (this.ctrl.sim.state.resources.food < t.cost) {
      this.flash("Not enough food");
      return;
    }
    this.ctrl.sim.state.resources.food -= t.cost;
    const wy = this.snap(p.worldY);
    this.add.image(this.snap(p.worldX), wy, t.icon).setOrigin(0.5, 0.85).setDepth(wy);
    this.flash(`${t.label} built`);
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
    this.revealFog();
    this.syncHud();
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
      this.player.x = Phaser.Math.Clamp(this.player.x + (dx / len) * step, 12, WORLD_W - 12);
      this.player.y = Phaser.Math.Clamp(this.player.y + (dy / len) * step, 40, WORLD_H - 12);
      this.player.setDepth(this.player.y);
      if (Math.abs(dx) > 0.5) this.player.setFlipX(dx < 0);

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
    this.hud.setText(
      `${s.era}   👥 ${this.ctrl.sim.living.length}   🍖 ${Math.floor(s.resources.food)}   ${s.biome}`,
    );
  }
}
