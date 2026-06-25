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
import { chooseNpcActivity, type NpcActivity } from "./npcActivity.js";
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

const PLAYER_SPEED = 142; // px/sec top speed
// Velocity ramps toward the target each frame (lerp factor per second), so the
// chieftain has a little heft: a quick spin-up and a brief glide to a stop
// rather than snapping between full speed and frozen.
const PLAYER_ACCEL = 10; // spin-up: brisk but not instant
const PLAYER_DECEL = 14; // stopping: a short glide, never a long skid
const PLAYER_SCALE = 1.15;
// How far ahead the camera looks in the travel direction, and the lerp that
// eases the lead in/out so reversing course doesn't whip the view.
const CAMERA_LEAD = 64;
const CAMERA_LEAD_LERP = 4;
const FOG_CELL = 64;
const FOG_DEPTH = 5000;
const UI_DEPTH = 100000;

/** One full dawn→day→dusk→night→dawn loop, in render time (sim stays paused). */
const DAY_LENGTH_MS = 90_000;
/**
 * Ambient sky-tint keyframes across the day — `[t, r, g, b, alpha]` with t in
 * 0..1. Dawn warms to orange, noon is clear, dusk burns, night goes deep blue.
 * A full-screen overlay lerps between adjacent keys each frame.
 */
const SKY_KEYS: readonly [number, number, number, number, number][] = [
  [0.0, 10, 18, 52, 0.58],
  [0.22, 38, 30, 72, 0.46],
  [0.3, 255, 150, 90, 0.26],
  [0.42, 255, 240, 210, 0.04],
  [0.5, 255, 255, 255, 0.0],
  [0.62, 255, 240, 205, 0.05],
  [0.72, 255, 125, 70, 0.3],
  [0.82, 120, 52, 92, 0.44],
  [1.0, 10, 18, 52, 0.58],
];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The raw resources you can gather and spend. */
type ResKind = "wood" | "food" | "stone";

/** Minimum gap between harvests, so holding/spamming Space reads as crisp hits. */
const GATHER_COOLDOWN_MS = 220;
/** Particle tint per resource — woody brown, leafy green, cool grey stone. */
const RES_COLOR: Record<ResKind, number> = { wood: 0xb5793b, food: 0x6fcf57, stone: 0xc2c6cf };
/** Floating-gain text colour per resource (a brighter sibling of the particle). */
const RES_TEXT: Record<ResKind, string> = { wood: "#e0a060", food: "#9fe070", stone: "#d6dae6" };

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
  activity: NpcActivity; // what they're currently doing on arrival at (tx,ty)
  workT: number; // ms spent at the current spot — drives the work bob and lingering
  faceX: number; // world x they turn toward while working (node or fire)
}

/** A harvestable node in the world — a tree, bush, rock or planted crop. */
interface Gatherable {
  sprite: Phaser.GameObjects.Image;
  kind: ResKind;
  amount: number;
}

/** A task a villager gives you: gather or build something for a reward. */
interface Quest {
  giverId: number;
  desc: string;
  kind: "gather" | "build";
  res?: ResKind;
  build?: "hut" | "farm";
  target: number;
  reward: { res: ResKind; amount: number };
  state: "available" | "active" | "ready" | "done";
  start: number; // progress-metric snapshot taken when accepted
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
  private vx = 0; // current velocity (px/sec) — ramped toward the input direction
  private vy = 0;
  private bobPhase = 0; // accumulates with distance walked, drives the footstep bob
  private leadX = 0; // eased camera lead offset, grows in the travel direction
  private leadY = 0;

  private npcs: Npc[] = [];
  private hoverLabel!: Phaser.GameObjects.Text;

  private fog: Phaser.GameObjects.Rectangle[] = [];
  private fogRevealed: boolean[] = [];

  private dialog!: Phaser.GameObjects.Container;
  private dialogName!: Phaser.GameObjects.Text;
  private dialogBody!: Phaser.GameObjects.Text;
  private dialogOpen = false;

  private hud!: Phaser.GameObjects.Text;

  // Render-side day/night clock (independent of the paused sim).
  private dayTime = 0.32; // 0..1 fraction of the day; start mid-morning
  private ambient!: Phaser.GameObjects.Rectangle; // full-screen sky tint
  private clockHud!: Phaser.GameObjects.Text;
  private nightLights: { glow: Phaser.GameObjects.Ellipse; max: number; fire: boolean }[] = [];

  private buildMode: BuildType | null = null;
  private ghost!: Phaser.GameObjects.Image;
  private ghostTile!: Phaser.GameObjects.Rectangle; // snapped footprint under the ghost
  private buildBtns: { type: BuildType; bg: Phaser.GameObjects.Rectangle }[] = [];

  private solids: { x: number; y: number; r: number }[] = [];
  private gatherables: Gatherable[] = [];
  private campfires: { x: number; y: number }[] = []; // fires villagers cluster at after dark
  private gatherKey!: Phaser.Input.Keyboard.Key;
  private gatherCooldown = 0;
  private sfxCtx: AudioContext | null = null;
  private gatherPrompt!: Phaser.GameObjects.Text;
  private resHud!: Phaser.GameObjects.Text;
  private housing = 0;

  private npcPhase = 0;
  private npcTimer = 0;
  private objText!: Phaser.GameObjects.Text;
  private farmsBuilt = 0;
  private quests: Quest[] = [];
  private questMarkers = new Map<number, Phaser.GameObjects.Text>();
  private gathered: Record<ResKind, number> = { wood: 0, food: 0, stone: 0 };

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
      this.addNightGlow(CAMP.x + 2, CAMP.y + 34, 84, 48, 0xffb066, 0.5, true);
      this.campfires.push({ x: CAMP.x + 2, y: CAMP.y + 30 });
    }

    this.spawnNpcs();
    this.setupQuests();
    this.spawnPlayer();
    this.buildFog();
    this.buildHud();
    this.buildDayNight();
    this.buildDialog();
    this.buildBuildBar();
    // A grid-snapped footprint sits under the ghost so the placement cell — and
    // whether it is affordable (green) or not (red) — is unmistakable.
    this.ghostTile = this.add
      .rectangle(0, 0, TILE, TILE, 0x66ff66, 0.22)
      .setStrokeStyle(1.5, 0x66ff66, 0.9)
      .setDepth(FOG_DEPTH - 2)
      .setVisible(false);
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
      this.npcs.push({
        ind,
        sprite,
        baseKey,
        homeX: x,
        homeY: y,
        tx: x,
        ty: y,
        activity: "wander",
        workT: 0,
        faceX: x,
      });
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
    this.player.setScale(PLAYER_SCALE);
    // A gentle lerp keeps the follow smooth; a small deadzone lets the chieftain
    // drift off dead-centre before the camera reacts, and movePlayer nudges the
    // follow offset so the view leads slightly into wherever you're heading.
    const cam = this.cameras.main;
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setDeadzone(VIEW_W * 0.16, VIEW_H * 0.16);
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
    const q = this.quests.find((x) => x.giverId === ind.id && x.state !== "done");
    this.dialogName.setText(individualName(ind));
    this.dialogBody.setText(q ? this.questLine(q) : this.lineFor(ind));
    this.dialog.setVisible(true);
    this.dialogOpen = true;
    this.hoverLabel.setVisible(false);
  }

  /** Talking to a giver accepts an available quest, or turns in a finished one. */
  private questLine(q: Quest): string {
    if (q.state === "available") {
      q.state = "active";
      q.start =
        q.kind === "gather" && q.res
          ? this.gathered[q.res]
          : q.build === "farm"
            ? this.farmsBuilt
            : this.housing;
      this.flash(`Task accepted: ${q.desc}`);
      return `A task for you: ${q.desc}. Come back when it's done for ${q.reward.amount} ${q.reward.res}.`;
    }
    if (q.state === "ready") {
      q.state = "done";
      this.ctrl.sim.state.resources[q.reward.res] += q.reward.amount;
      this.flash(`Quest complete! +${q.reward.amount} ${q.reward.res}`);
      return `Well done! Take these ${q.reward.amount} ${q.reward.res} with my thanks.`;
    }
    return `${q.desc} — ${Math.min(this.questProgress(q), q.target)}/${q.target}. Come back when it's done.`;
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
    this.ghostTile.setVisible(true);
    this.highlightBuildBtns();
  }

  private cancelBuild(): void {
    this.buildMode = null;
    this.ghost.setVisible(false);
    this.ghostTile.setVisible(false);
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
    const wx = this.snap(p.worldX);
    const wy = this.snap(p.worldY);
    this.ghost.setPosition(wx, wy);
    this.ghostTile.setPosition(wx, wy);
    const cost = this.buildMode.cost;
    const ok = this.ctrl.sim.state.resources[cost.res] >= cost.amount;
    // Green = affordable, red = not. Affordable also reads brighter/solider.
    const col = ok ? 0x66ff66 : 0xff5a5a;
    this.ghost.setTint(col).setAlpha(ok ? 0.75 : 0.5);
    this.ghostTile.setFillStyle(col, 0.22).setStrokeStyle(1.5, col, 0.9);
  }

  private tryPlace(p: Phaser.Input.Pointer): void {
    const t = this.buildMode;
    if (!t) return;
    const res = this.ctrl.sim.state.resources;
    if (res[t.cost.res] < t.cost.amount) {
      this.denyBuild(`Not enough ${t.cost.res}`);
      return;
    }
    res[t.cost.res] -= t.cost.amount;
    const wx = this.snap(p.worldX);
    const wy = this.snap(p.worldY);
    if (t.id === "farm") {
      // A farm is flat ground you walk over — and a renewable food source.
      const crop = this.add.image(wx, wy, "crop").setDepth(2);
      this.raiseIn(crop);
      this.gatherables.push({ sprite: crop, kind: "food", amount: 12 });
      this.farmsBuilt += 1;
      this.flash("Farm built — Space to harvest food");
    } else {
      const spr = this.add.image(wx, wy, t.icon).setOrigin(0.5, 0.9).setDepth(wy);
      this.raiseIn(spr);
      if (t.id === "hut") {
        this.housing += 1; // shelter for more of the tribe
        this.solids.push({ x: wx, y: wy, r: 10 });
        this.addNightGlow(wx, wy - 6, 30, 22, 0xffd27a, 0.45, false); // a lit window after dark
        this.flash("Hut built — +1 housing");
      } else {
        this.addNightGlow(wx, wy, 72, 42, 0xffb066, 0.5, true); // campfire's warm glow, lit at night
        this.campfires.push({ x: wx, y: wy }); // villagers will gather here after dark
        this.flash("Campfire built — warmth");
      }
    }
    this.dustBurst(wx, wy); // a kick of dust as it lands
    this.buildSfx(true);
    this.updateGhost(p); // refresh the affordability tint after spending
  }

  /** Refuse a placement loudly: reason text, a red ghost shake, and a low buzz. */
  private denyBuild(reason: string): void {
    this.flash(reason);
    this.buildSfx(false);
    const gx = this.ghost.x;
    this.ghost.setTint(0xff5a5a);
    this.tweens.add({
      targets: this.ghost,
      x: gx + 5,
      duration: 45,
      yoyo: true,
      repeat: 3,
      ease: "Sine.easeInOut",
      onComplete: () => this.ghost.setX(gx),
    });
  }

  /** A short "raising" pop: the structure rises from a squashed base into place. */
  private raiseIn(spr: Phaser.GameObjects.Image): void {
    const sx = spr.scaleX;
    const sy = spr.scaleY;
    spr.setScale(sx * 1.15, sy * 0.18).setAlpha(0.5);
    this.tweens.add({
      targets: spr,
      scaleX: sx,
      scaleY: sy,
      alpha: 1,
      duration: 320,
      ease: "Back.easeOut",
    });
  }

  /** A low, ground-hugging puff of dust where a structure lands. */
  private dustBurst(x: number, y: number): void {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const dist = 14 + Math.random() * 20;
      const dot = this.add
        .circle(x, y, Phaser.Math.Between(2, 4), 0xcbb892, 0.9)
        .setDepth(FOG_DEPTH - 2);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(a) * dist,
        y: y + Math.abs(Math.sin(a)) * dist * 0.45 - 2, // hugs the ground, settles down
        alpha: 0,
        scale: 0.3,
        duration: 380 + Math.random() * 180,
        ease: "Quad.easeOut",
        onComplete: () => dot.destroy(),
      });
    }
  }

  /** A built/denied cue: a solid "thunk" on success, a short buzz on refusal.
   *  Fired inside the click gesture, so browser autoplay rules are satisfied. */
  private buildSfx(ok: boolean): void {
    try {
      if (!this.sfxCtx) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.sfxCtx = new Ctor();
      }
      const ctx = this.sfxCtx;
      if (ctx.state === "suspended") void ctx.resume();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = ok ? "square" : "sawtooth";
      const dur = ok ? 0.22 : 0.16;
      osc.frequency.setValueAtTime(ok ? 170 : 130, now);
      osc.frequency.exponentialRampToValueAtTime(ok ? 60 : 80, now + dur * 0.8);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(ok ? 0.09 : 0.05, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    } catch {
      /* audio unavailable */
    }
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
    this.updateNpcs(dt);
    this.updateGather(dt);
    this.updateQuests();
    this.revealFog();
    this.updateDayNight(dt);
    this.syncHud();
  }

  /**
   * Give the band visible daily lives: villagers walk to nearby trees/bushes (or
   * a placed farm) and play a gather/tending bob, and after dark most drift to a
   * campfire to cluster around its warmth. All render-side and lightweight — the
   * re-decide search runs only when a villager finishes a spot, never per frame.
   */
  private updateNpcs(dt: number): void {
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
      if (d >= 3) {
        // En route — reuse the shared walk cycle and keep depth-sorted by feet.
        s.x += (dx / d) * speed;
        s.y += (dy / d) * speed;
        s.setDepth(s.y);
        if (s.scaleX !== 1 || s.scaleY !== 1) s.setScale(1);
        s.setFlipX(dx < 0);
        const pose = HOMININ_WALK[(this.npcPhase + i) & 3];
        const fk = homininFrameKey(n.baseKey, pose);
        if (s.texture.key !== fk) s.setTexture(fk);
        return;
      }
      // Arrived: act out the chosen activity, then re-pick after a short linger.
      n.workT += dt;
      if (s.texture.key !== n.baseKey) s.setTexture(n.baseKey);
      s.setFlipX(n.faceX < s.x);
      if (n.activity === "gather") {
        // A chopping/tending bob in place — quick squash-and-stretch.
        const b = Math.abs(Math.sin(n.workT / 110));
        s.setScale(1 + b * 0.05, 1 - b * 0.08);
      } else if (s.scaleX !== 1 || s.scaleY !== 1) {
        s.setScale(1); // campfire/wander: stand still
      }
      const linger = n.activity === "campfire" ? 4000 : n.activity === "gather" ? 2200 : 0;
      if (n.workT >= linger) this.repickNpc(n);
    });
  }

  private isNight(): boolean {
    return this.dayTime < 0.23 || this.dayTime >= 0.82;
  }

  /** Nearest tree/bush/crop to a point, within range — a spot worth working. */
  private nearestNodeTo(x: number, y: number, range: number): Gatherable | null {
    let best: Gatherable | null = null;
    let bestD = range;
    for (const g of this.gatherables) {
      const d = Phaser.Math.Distance.Between(x, y, g.sprite.x, g.sprite.y);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    return best;
  }

  /** Choose a villager's next activity and walk target from the world around them. */
  private repickNpc(n: Npc): void {
    n.workT = 0;
    const node = this.nearestNodeTo(n.homeX, n.homeY, 220);
    const fire = this.campfires.length
      ? this.campfires[Math.floor(Math.random() * this.campfires.length)]
      : null;
    n.activity = chooseNpcActivity({
      night: this.isNight(),
      hasCampfire: fire !== null,
      hasNearbyNode: node !== null,
      campfireRoll: Math.random(),
      workRoll: Math.random(),
    });
    if (n.activity === "campfire" && fire) {
      const a = Math.random() * Math.PI * 2;
      const r = 26 + Math.random() * 16;
      n.tx = Phaser.Math.Clamp(fire.x + Math.cos(a) * r, 30, WORLD_W - 30);
      n.ty = Phaser.Math.Clamp(fire.y + Math.sin(a) * r * 0.7, 50, WORLD_H - 20);
      n.faceX = fire.x;
    } else if (n.activity === "gather" && node) {
      // Stand just beside the node (toward home), not on top of it, and face it.
      const a = Math.atan2(n.homeY - node.sprite.y, n.homeX - node.sprite.x);
      n.tx = Phaser.Math.Clamp(node.sprite.x + Math.cos(a) * 16, 30, WORLD_W - 30);
      n.ty = Phaser.Math.Clamp(node.sprite.y + Math.sin(a) * 8 + 2, 50, WORLD_H - 20);
      n.faceX = node.sprite.x;
    } else {
      n.activity = "wander";
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 55;
      n.tx = Phaser.Math.Clamp(n.homeX + Math.cos(a) * r, 30, WORLD_W - 30);
      n.ty = Phaser.Math.Clamp(n.homeY + Math.sin(a) * r, 50, WORLD_H - 20);
    }
  }

  // ── quests ───────────────────────────────────────────────────────────────

  private setupQuests(): void {
    const specs: Omit<Quest, "giverId" | "state" | "start">[] = [
      { desc: "Gather 5 wood", kind: "gather", res: "wood", target: 5, reward: { res: "food", amount: 12 } },
      { desc: "Build a Farm", kind: "build", build: "farm", target: 1, reward: { res: "wood", amount: 15 } },
      { desc: "Gather 4 stone", kind: "gather", res: "stone", target: 4, reward: { res: "food", amount: 15 } },
    ];
    specs.forEach((s, i) => {
      const giver = this.npcs[i * 4]; // spread the givers through the band
      if (!giver) return;
      this.quests.push({ ...s, giverId: giver.ind.id, state: "available", start: 0 });
      const marker = this.add
        .text(giver.sprite.x, giver.sprite.y, "!", {
          fontFamily: "monospace",
          fontSize: "16px",
          color: "#ffe54a",
          fontStyle: "bold",
        })
        .setOrigin(0.5, 1);
      this.questMarkers.set(giver.ind.id, marker);
    });
  }

  private giverName(id: number): string {
    const n = this.npcs.find((x) => x.ind.id === id);
    return n ? individualName(n.ind) : "a villager";
  }

  /** How far along an accepted quest is, measured against its accept-time snapshot. */
  private questProgress(q: Quest): number {
    if (q.kind === "gather" && q.res) return this.gathered[q.res] - q.start;
    if (q.kind === "build") return (q.build === "farm" ? this.farmsBuilt : this.housing) - q.start;
    return 0;
  }

  private updateQuests(): void {
    let tracker = "";
    for (const q of this.quests) {
      if (q.state === "active" && this.questProgress(q) >= q.target) q.state = "ready";
      const marker = this.questMarkers.get(q.giverId);
      const giver = this.npcs.find((n) => n.ind.id === q.giverId);
      if (marker && giver) {
        const sym = q.state === "available" ? "!" : q.state === "ready" ? "?" : "";
        const bob = Math.sin(this.time.now / 250) * 2;
        marker
          .setText(sym)
          .setVisible(sym !== "")
          .setPosition(giver.sprite.x, giver.sprite.y - giver.sprite.displayHeight + bob)
          .setDepth(giver.sprite.y + 1);
      }
      if (!tracker && (q.state === "active" || q.state === "ready")) {
        const who = this.giverName(q.giverId);
        tracker =
          q.state === "ready"
            ? `◆ ${q.desc} — done! return to ${who}`
            : `◆ ${who}: ${q.desc} — ${Math.min(this.questProgress(q), q.target)}/${q.target}`;
      }
    }
    if (!tracker) {
      tracker = this.quests.some((q) => q.state === "available")
        ? "◆ Find a villager marked ! for a task"
        : "◆ All tasks done — explore freely";
    }
    this.objText.setText(tracker);
  }

  private blocked(x: number, y: number): boolean {
    const r = 7; // player half-width at the feet
    return this.solids.some((s) => Phaser.Math.Distance.Between(x, y, s.x, s.y) < s.r + r);
  }

  // ── gathering ────────────────────────────────────────────────────────────

  private updateGather(dt: number): void {
    if (this.gatherCooldown > 0) this.gatherCooldown -= dt;
    const node = this.nearestGatherable(34);
    if (!node) {
      this.gatherPrompt.setVisible(false);
      return;
    }
    const cam = this.cameras.main;
    const ready = this.gatherCooldown <= 0;
    this.gatherPrompt
      .setText(ready ? `Space: gather ${node.kind}` : "…")
      .setAlpha(ready ? 1 : 0.6)
      .setPosition(node.sprite.x - cam.scrollX, node.sprite.y - cam.scrollY - node.sprite.displayHeight)
      .setVisible(true);
    if (ready && Phaser.Input.Keyboard.JustDown(this.gatherKey)) this.gather(node);
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
    this.gathered[node.kind] += 1;
    node.amount -= 1;
    this.gatherCooldown = GATHER_COOLDOWN_MS;

    const spr = node.sprite;
    const px = spr.x;
    const py = spr.y - spr.displayHeight * 0.5; // burst from the node's middle
    this.floatGain(px, py, `+1 ${node.kind}`, RES_TEXT[node.kind]);
    this.popParticles(px, py, RES_COLOR[node.kind]);
    this.gatherSfx(node.kind);

    if (node.amount <= 0) {
      // Depleted: a final pop, then clearly wilt away — shrink, tip and fade out.
      this.gatherables = this.gatherables.filter((g) => g !== node);
      this.popParticles(px, py, RES_COLOR[node.kind]);
      this.tweens.add({
        targets: spr,
        alpha: 0,
        scaleX: spr.scaleX * 0.45,
        scaleY: spr.scaleY * 0.45,
        angle: spr.angle + 14,
        duration: 460,
        ease: "Back.easeIn",
        onComplete: () => spr.destroy(),
      });
    } else {
      // A squash-and-stretch punch so each individual hit lands.
      this.tweens.add({
        targets: spr,
        scaleX: spr.scaleX * 1.14,
        scaleY: spr.scaleY * 0.88,
        duration: 80,
        yoyo: true,
        ease: "Quad.easeOut",
      });
    }
  }

  /** A small radial burst of fading dots at a world point — the gather "pop". */
  private popParticles(x: number, y: number, color: number): void {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.6;
      const dist = 10 + Math.random() * 14;
      const dot = this.add
        .circle(x, y, Phaser.Math.Between(2, 3), color)
        .setDepth(FOG_DEPTH - 2);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist - 6,
        alpha: 0,
        scale: 0.3,
        duration: 340 + Math.random() * 140,
        ease: "Quad.easeOut",
        onComplete: () => dot.destroy(),
      });
    }
  }

  /** A "+1 wood" that rises off the node and fades — anchored in the world. */
  private floatGain(x: number, y: number, msg: string, color: string): void {
    const t = this.add
      .text(x, y, msg, {
        fontFamily: "monospace",
        fontSize: "12px",
        color,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(FOG_DEPTH - 1);
    this.tweens.add({
      targets: t,
      y: y - 26,
      alpha: 0,
      duration: 760,
      ease: "Sine.easeOut",
      onComplete: () => t.destroy(),
    });
  }

  /** A soft synthesized "tock", pitched per resource. Lazily opened on first use
   *  — always within the Space-key gesture, so browser autoplay rules are met. */
  private gatherSfx(kind: ResKind): void {
    try {
      if (!this.sfxCtx) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.sfxCtx = new Ctor();
      }
      const ctx = this.sfxCtx;
      if (ctx.state === "suspended") void ctx.resume();
      const base = { wood: 220, food: 330, stone: 165 }[kind];
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(base * 1.5, now + 0.08);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.06, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(g).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      /* audio unavailable */
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
    // Target velocity: full speed along the desired heading, or zero when idle.
    const tvx = len > 0.001 ? (dx / len) * PLAYER_SPEED : 0;
    const tvy = len > 0.001 ? (dy / len) * PLAYER_SPEED : 0;
    // Ease velocity toward the target — accelerating into motion, gliding out of
    // it — so WASD taps and click destinations both land with a bit of weight.
    const ramp = Math.min(1, (len > 0.001 ? PLAYER_ACCEL : PLAYER_DECEL) * sec);
    this.vx += (tvx - this.vx) * ramp;
    this.vy += (tvy - this.vy) * ramp;

    const speed = Math.hypot(this.vx, this.vy);
    const moving = speed > 3; // ignore the velocity tail once we've nearly stopped
    if (moving) {
      const step = speed * sec;
      const ux = this.vx / speed;
      const uy = this.vy / speed;
      // Try the straight path, then progressively wider angles, so movement
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

      // Footstep cadence: a subtle vertical bob, scaled by actual speed so it
      // grows as you spin up and settles as you glide to a halt. The feet stay
      // planted (origin is at the feet) — only the body bounces.
      this.bobPhase += (speed / PLAYER_SPEED) * dt * 0.013;
      const amp = 0.045 * Math.min(1, speed / PLAYER_SPEED);
      this.player.scaleY = PLAYER_SCALE * (1 + Math.abs(Math.sin(this.bobPhase)) * amp);
    } else {
      this.vx = 0;
      this.vy = 0;
      this.player.scaleY += (PLAYER_SCALE - this.player.scaleY) * Math.min(1, 12 * sec);
      if (this.player.texture.key !== this.playerKey) {
        this.player.setTexture(this.playerKey); // settle on the standing pose
      }
    }

    // Camera lead: ease a follow offset in the direction of travel so the view
    // shows a little more of what lies ahead than what's behind.
    const tLeadX = speed > 3 ? (this.vx / speed) * CAMERA_LEAD : 0;
    const tLeadY = speed > 3 ? (this.vy / speed) * CAMERA_LEAD : 0;
    const leadRamp = Math.min(1, CAMERA_LEAD_LERP * sec);
    this.leadX += (tLeadX - this.leadX) * leadRamp;
    this.leadY += (tLeadY - this.leadY) * leadRamp;
    this.cameras.main.setFollowOffset(-this.leadX, -this.leadY);
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

  // ── day/night cycle ────────────────────────────────────────────────────────

  /** The sky-tint overlay and the HUD time-of-day readout. */
  private buildDayNight(): void {
    this.ambient = this.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0x0a1234, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(FOG_DEPTH - 20); // over the world, under the fog and the HUD
    this.clockHud = this.add
      .text(VIEW_W - 10, 8, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#e9e0c8",
        backgroundColor: "#00000066",
        padding: { x: 6, y: 4 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH);
  }

  /** Register a warm light that fades up at night and fades out by day. */
  private addNightGlow(x: number, y: number, w: number, h: number, color: number, max: number, fire: boolean): void {
    const glow = this.add.ellipse(x, y, w, h, color, 0).setDepth(1);
    this.nightLights.push({ glow, max, fire });
  }

  /** Sky tint at a given time of day, lerped between the keyframes. */
  private ambientAt(t: number): { color: number; alpha: number } {
    let i = 0;
    while (i < SKY_KEYS.length - 1 && t > SKY_KEYS[i + 1][0]) i++;
    const a = SKY_KEYS[i];
    const b = SKY_KEYS[Math.min(i + 1, SKY_KEYS.length - 1)];
    const span = b[0] - a[0] || 1;
    const f = clamp01((t - a[0]) / span);
    const r = Math.round(a[1] + (b[1] - a[1]) * f);
    const g = Math.round(a[2] + (b[2] - a[2]) * f);
    const bl = Math.round(a[3] + (b[3] - a[3]) * f);
    return { color: (r << 16) | (g << 8) | bl, alpha: a[4] + (b[4] - a[4]) * f };
  }

  private phaseLabel(t: number): string {
    if (t < 0.23 || t >= 0.82) return "🌙 Night";
    if (t < 0.34) return "🌅 Dawn";
    if (t < 0.68) return "☀ Day";
    return "🌇 Dusk";
  }

  /** Advance the clock and apply the tint, the lit campfires/huts, and the HUD. */
  private updateDayNight(dt: number): void {
    this.dayTime = (this.dayTime + dt / DAY_LENGTH_MS) % 1;
    const { color, alpha } = this.ambientAt(this.dayTime);
    this.ambient.setFillStyle(color, alpha);
    // 1 at midnight, 0 at noon — drives how strongly the warm lights glow.
    const night = 0.5 + 0.5 * Math.cos(this.dayTime * Math.PI * 2);
    const flicker = 0.85 + 0.15 * Math.sin(this.time.now / 90);
    for (const l of this.nightLights) {
      l.glow.setAlpha(l.max * night * (l.fire ? flicker : 1));
    }
    this.clockHud.setText(this.phaseLabel(this.dayTime));
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
