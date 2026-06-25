import Phaser from "phaser";
import {
  TILE,
  makeBiomeTextures,
  makeDecorTextures,
  makeShelterTextures,
  makeFireTextures,
  makeTotemTexture,
  ensureHomininTexture,
  type MorphParams,
} from "./textures.js";
import { HOMININ_WALK, homininFrameKey } from "./homininWalk.js";
import { chooseNpcActivity, type NpcActivity } from "./npcActivity.js";
import { questMetric, type QuestMetrics, type QuestSpec } from "./quests.js";
import { buildDialogue, type DialogNode } from "./dialogue.js";
import { buildRaidSides, resolveRaid } from "./raidDefense.js";
import { outbreakRisk } from "./epidemicRisk.js";
import { isPointVisible } from "./cull.js";
import {
  TUTORIAL_STEPS,
  advanceTutorial,
  tutorialSeen,
  markTutorialSeen,
  type TutorialEvent,
} from "./tutorial.js";
import {
  ERAS,
  TECH_TREE,
  BELIEF_STAGES,
  individualName,
  notableById,
  selectLeader,
  leaderBonus,
  shiftRelations,
  rivalRegion,
  type Biome,
  type Individual,
  type LeaderBonus,
  type Notable,
  type RivalTribe,
  type TechId,
} from "../sim/index.js";
import { dispositionStyle } from "../ui/diplomacy.js";
import { CONTROLS, QUEST_MARKER, BUILD_MARKER } from "./a11y.js";
import { WorldAudio } from "../ui/audio.js";
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

// Conversation panel geometry, shared by buildDialog and the choice layout.
const DIALOG_W = 480;
const DIALOG_H = 150;
const DIALOG_X = VIEW_W / 2;
const DIALOG_Y = VIEW_H - 90;
const UI_DEPTH = 100000;

// Research (tech) panel geometry, shared by its frame and the row/button layout.
const TECH_W = 452;
const TECH_H = 236;

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

/** One study session at the totem: spend this much food, gain this much insight. */
const STUDY_FOOD = 5;
const STUDY_POINTS = 30;
/** A ritual at the campfire: an offering of food that deepens the tribe's belief. */
const RITUAL_FOOD = 6;
const RITUAL_CULTURE = 14; // belief gained per ritual (mirrors the sim's cultureRitual)
const RITUAL_RANGE = 48; // how close to a fire you must stand to hold one
const RITUAL_COOLDOWN_MS = 600; // a brief pause between rituals
/** A gift to the neighbour camp: an offering of food that warms relations. */
const GIFT_FOOD = 6; // mirrors the sim's diploReciprocateCost
const GIFT_RELATIONS = 0.2; // relations warmed per gift (mirrors the sim's diploRelUp)
const GIFT_RANGE = 56; // how close to the neighbour camp you must stand
const GIFT_COOLDOWN_MS = 600; // a brief pause between gifts

/**
 * The living economy runs in slow real-time while you play: every tick the tribe
 * eats from the shared food store you fill by gathering, the seasons turn, and
 * births/deaths play out (see {@link Simulation.economyTick}). One tick is a
 * deliberate, readable beat — slow enough that a stocked larder buys you time to
 * range out and explore.
 */
const ECONOMY_TICK_MS = 7000;
/** Carrying-capacity each player-built hut adds — more shelter, more people. */
const HUT_CAPACITY = 4;

const RAID_FIRST_MS = 45000; // first raid only after the player has settled in
const RAID_REPEAT_MS = 120000; // quiet stretch between raids
const RAID_WARN_MS = 12000; // sighting → raiders reach the camp (the defend window)
const RALLY_RANGE = 110; // how close to camp the chieftain must stand to rally
const RAID_PLUNDER_FOOD = 20; // most food raiders carry off (scaled by how badly it goes)
/** Particle tint per resource — woody brown, leafy green, cool grey stone. */
const RES_COLOR: Record<ResKind, number> = { wood: 0xb5793b, food: 0x6fcf57, stone: 0xc2c6cf };
/** Floating-gain text colour per resource (a brighter sibling of the particle). */
const RES_TEXT: Record<ResKind, string> = { wood: "#e0a060", food: "#9fe070", stone: "#d6dae6" };
/** Slack around the camera before a decorative burst is culled as off-screen. */
const PARTICLE_CULL_MARGIN = 48;

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
  farm?: boolean; // true for crops on a farm the player placed
}

/** A circular area an explore quest asks the player to scout. */
interface Region {
  name: string;
  x: number;
  y: number;
  r: number;
}

/** A live quest: a {@link QuestSpec} bound to a giver, with runtime state. */
interface Quest extends QuestSpec {
  giverId: number;
  state: "available" | "active" | "ready" | "done";
  start: number; // progress-metric snapshot taken when accepted
}

/**
 * The interactive session, persisted alongside the pure sim's save as its opaque
 * `view` blob (see {@link Simulation.view}). Captures everything the WorldScene
 * owns that the sim does not: where the chieftain stands, the buildings placed,
 * the fog lifted, and the gather/quest counters that drive objective progress.
 */
interface WorldView {
  player: { x: number; y: number };
  gathered: Record<ResKind, number>;
  housing: number;
  farmsBuilt: number;
  farmHarvests: number;
  talkedTo: number[];
  regionExplored: Record<string, number>;
  quests: { giverId: number; desc: string; state: Quest["state"]; start: number }[];
  /** Indices (into the fog grid) of cells the player has revealed. */
  fog: number[];
  buildings: { kind: "campfire" | "hut" | "farm"; x: number; y: number; amount: number }[];
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

  // Leaders & notables surfaced from the pure sim: the band's chieftain (crown)
  // and standout individuals (✦) get a clickable floating marker that opens an
  // inspect card, and the leader's tribe-wide trait bonus shows in the HUD.
  private leaderId: number | null = null;
  private notableMap: Map<number, Notable[]> = new Map();
  private inspectMarks: {
    ind: Individual;
    sprite: Phaser.GameObjects.Image;
    marker: Phaser.GameObjects.Text;
  }[] = [];
  private leaderHud!: Phaser.GameObjects.Text;
  private inspectCard!: Phaser.GameObjects.Container;
  private inspectName!: Phaser.GameObjects.Text;
  private inspectBody!: Phaser.GameObjects.Text;
  private inspectOpen = false;

  private fog: Phaser.GameObjects.Rectangle[] = [];
  private fogRevealed: boolean[] = [];
  private fogRemaining = 0; // unrevealed cells left, so revealFog can stop scanning

  private dialog!: Phaser.GameObjects.Container;
  private dialogName!: Phaser.GameObjects.Text;
  private dialogBody!: Phaser.GameObjects.Text;
  private dialogOpen = false;
  private dialogChoices: Phaser.GameObjects.Text[] = []; // live choice rows, rebuilt per node
  private dialogNode: DialogNode | null = null;

  private hud!: Phaser.GameObjects.Text;

  // Render-side day/night clock (independent of the paused sim).
  private dayTime = 0.32; // 0..1 fraction of the day; start mid-morning
  private ambient!: Phaser.GameObjects.Rectangle; // full-screen sky tint
  private clockHud!: Phaser.GameObjects.Text;
  private nightLights: { glow: Phaser.GameObjects.Ellipse; max: number; fire: boolean }[] = [];

  private buildMode: BuildType | null = null;
  private ghost!: Phaser.GameObjects.Image;
  private ghostTile!: Phaser.GameObjects.Rectangle; // snapped footprint under the ghost
  private ghostMark!: Phaser.GameObjects.Text; // colourblind-safe ✓/✕ affordability glyph
  private buildBtns: { type: BuildType; bg: Phaser.GameObjects.Rectangle }[] = [];
  // When build mode is entered from the keyboard (digit keys), the ghost tracks
  // the chieftain so it can be placed without a mouse; moving the mouse hands
  // aiming back to the pointer.
  private buildAimKeyboard = false;

  // A toggleable controls/help overlay (? or H), so the whole game is legible
  // and reachable from the keyboard alone.
  private helpOverlay!: Phaser.GameObjects.Container;
  private helpOpen = false;

  private solids: { x: number; y: number; r: number }[] = [];
  private gatherables: Gatherable[] = [];
  private campfires: { x: number; y: number }[] = []; // fires villagers cluster at after dark
  // Player-placed permanent buildings (huts/campfires), tracked for save/load.
  // Farms live in `gatherables` (they deplete), so they are captured from there.
  private placed: { kind: "campfire" | "hut"; x: number; y: number }[] = [];
  private gatherKey!: Phaser.Input.Keyboard.Key;
  private gatherCooldown = 0;
  // Diegetic audio: synthesized SFX + a biome/time-of-day ambient bed, silent
  // until a user gesture resumes it and behind the mute toggle (see ../ui/audio).
  private audio = new WorldAudio();
  private muteBtn!: Phaser.GameObjects.Text;
  private lastStepIdx = 0; // last footstep the walk-bob crossed, so each step sounds once
  private gatherPrompt!: Phaser.GameObjects.Text;
  private resHud!: Phaser.GameObjects.Text;
  private housing = 0;

  // The slow survival economy: a timer paces economyTick calls, and the food
  // change across the last tick drives a trend readout so the player can see at a
  // glance whether the tribe is being fed or going hungry.
  private econHud!: Phaser.GameObjects.Text;
  private economyTimer = 0;
  private foodTrend = 0; // net food change across the most recent economy tick

  // Belief: a ritual at any campfire offers food and accrues the sim's existing
  // Culture track; a HUD line shows the belief total/stage and a burst marks
  // each milestone crossed.
  private ritualKey!: Phaser.Input.Keyboard.Key;
  private ritualCooldown = 0;
  private ritualPrompt!: Phaser.GameObjects.Text;
  private cultureHud!: Phaser.GameObjects.Text;

  private npcPhase = 0;
  private npcTimer = 0;
  private objText!: Phaser.GameObjects.Text;
  private farmsBuilt = 0;
  private farmHarvests = 0; // food taken from farms the player placed
  private talkedTo = new Set<number>(); // distinct villagers the player has spoken to
  private quests: Quest[] = [];
  private questMarkers = new Map<number, Phaser.GameObjects.Text>();
  private exploreRegions: Region[] = [];
  private regionExplored: Record<string, number> = {}; // fog cells revealed per region
  private gathered: Record<ResKind, number> = { wood: 0, food: 0, stone: 0 };

  private questLog!: Phaser.GameObjects.Container;
  private questLogText!: Phaser.GameObjects.Text;
  private questLogOpen = false;

  private tutorialStep = -1; // -1 = inactive (already seen, or finished/skipped)
  private tutorialCard: Phaser.GameObjects.Container | null = null;
  private tutorialText!: Phaser.GameObjects.Text;

  // Research: a lore-totem at camp opens a compact tech panel onto the sim's
  // existing knowledge tree; the chieftain directs and funds the next discovery.
  private techPanel!: Phaser.GameObjects.Container;
  private techPanelBody!: Phaser.GameObjects.Text;
  private techPanelOpen = false;
  private techRows: Phaser.GameObjects.Text[] = []; // live, clickable available-tech rows
  private studyBtn!: Phaser.GameObjects.Text;
  private researchHud!: Phaser.GameObjects.Text;
  private campFireLit = false; // camp hearth shown once 'fire' is known

  // Rivals: one neighbour tribe (from the sim's dormant rivals data) gets a
  // reachable camp out in the world, with its disposition shown. Standing near it
  // and pressing G sends a gift of food that warms the player-relations the sim
  // already tracks (shiftRelations) — a real, persisted diplomacy outcome.
  private rival: RivalTribe | null = null;
  private rivalCamp: { x: number; y: number } | null = null;
  private rivalLabel!: Phaser.GameObjects.Text; // floating name/disposition/relations over the camp
  private giftKey!: Phaser.Input.Keyboard.Key;
  private giftCooldown = 0;
  private giftPrompt!: Phaser.GameObjects.Text;

  // Interactive camp defence: a hostile party marches on the camp; the chieftain
  // rallies villagers during a short window, then the raid resolves on the sim's
  // own skirmish math (see ./raidDefense).
  private defendKey!: Phaser.Input.Keyboard.Key;
  private raidTimer = RAID_FIRST_MS; // counts down to the next sighting
  private raidActive = false;
  private raidCountdown = 0; // ms until the raiders reach the camp
  private raidParty: Phaser.GameObjects.Image | null = null;
  private raidStart: { x: number; y: number } | null = null;
  private rallied = new Set<number>(); // villagers mustered to the camp this raid
  private raidBanner!: Phaser.GameObjects.Text; // top-screen threat indicator
  private raidPrompt!: Phaser.GameObjects.Text; // "F: rally" near the camp

  constructor() {
    super("world");
  }

  create(): void {
    this.ctrl = this.registry.get("controller") as GameController;
    // Phaser reuses this scene instance across restarts (load reloads via
    // scene.restart), so field initializers do not re-run — clear the per-run
    // collections here so create() rebuilds the world from a clean slate.
    this.resetWorldState();
    const biome = this.ctrl.sim.state.biome;
    this.audio.setBiome(biome); // colour the ambient bed for this world's biome

    makeBiomeTextures(this);
    makeDecorTextures(this);
    makeShelterTextures(this);
    makeFireTextures(this);
    makeTotemTexture(this);

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBackgroundColor("#1d2a17");

    this.paintGround(biome);
    this.buildTerrain(biome);
    this.add.image(CAMP.x, CAMP.y - 6, "shelter-cave").setDepth(CAMP.y);
    if (this.ctrl.sim.state.knowledge.has("fire")) this.lightCampfire();

    this.spawnNpcs();
    this.setupQuests();
    this.markNotables();
    this.spawnPlayer();
    this.placeTotem();
    this.placeRivalCamp();
    this.buildFog();
    this.buildHud();
    this.buildDayNight();
    this.buildDialog();
    this.buildBuildBar();
    this.buildQuestLog();
    this.buildTechPanel();
    this.buildInspectCard();
    this.buildHelpOverlay();
    this.buildSaveBar();
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
    // A ✓/✕ glyph over the footprint so affordability never relies on the
    // red/green tint alone (the most common colourblindness).
    this.ghostMark = this.add
      .text(0, 0, "", { fontFamily: "monospace", fontSize: "18px", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(FOG_DEPTH - 1)
      .setVisible(false);

    this.keys = {
      up: [this.key("W"), this.key("UP")],
      down: [this.key("S"), this.key("DOWN")],
      left: [this.key("A"), this.key("LEFT")],
      right: [this.key("D"), this.key("RIGHT")],
    };
    this.gatherKey = this.key("SPACE");
    this.ritualKey = this.key("R");
    this.giftKey = this.key("G");
    this.defendKey = this.key("F");

    // One handler does both jobs: a click on a tribe member talks; a click on the
    // ground walks there. `currentlyOver` is every interactive object under the
    // pointer, so we never have to fight event ordering.
    this.input.on(
      "pointerdown",
      (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
        this.audio.resume(); // a click is a user gesture — opens audio (browser autoplay)
        if (this.helpOpen) {
          this.toggleHelp(); // a click anywhere dismisses the help overlay
          return;
        }
        if (currentlyOver.some((o) => o.getData("muteBtn"))) {
          this.toggleMute();
          return;
        }
        if (currentlyOver.some((o) => o.getData("saveBtn"))) {
          this.saveGame();
          return;
        }
        if (currentlyOver.some((o) => o.getData("loadBtn"))) {
          this.loadGame();
          return;
        }
        if (currentlyOver.some((o) => o.getData("tutorialSkip"))) {
          this.endTutorial(false);
          return;
        }
        if (this.dialogOpen) {
          const choice = currentlyOver.find((o) => o.getData("choiceIdx") !== undefined);
          if (choice) this.selectChoice(choice.getData("choiceIdx") as number);
          else this.closeDialog(); // a click anywhere else leaves the conversation
          return;
        }
        if (this.inspectOpen) {
          this.closeInspect(); // a click anywhere closes the inspect card
          return;
        }
        if (this.techPanelOpen) {
          if (currentlyOver.some((o) => o.getData("studyBtn"))) {
            this.study();
          } else {
            const row = currentlyOver.find((o) => o.getData("techId") !== undefined);
            if (row) this.chooseTech(row.getData("techId") as TechId);
            else this.closeTechPanel(); // a click off the rows/button leaves the panel
          }
          return;
        }
        if (currentlyOver.some((o) => o.getData("totem"))) {
          this.openTechPanel();
          return;
        }
        const btn = currentlyOver.find((o) => o.getData("buildBtn") !== undefined);
        if (btn) {
          this.toggleBuild(btn.getData("buildBtn") as string);
          return;
        }
        if (this.buildMode) {
          this.tryPlace(this.snap(pointer.worldX), this.snap(pointer.worldY));
          return;
        }
        const ins = currentlyOver.find((o) => o.getData("inspectId") !== undefined);
        if (ins) {
          const id = ins.getData("inspectId") as number;
          const mark = this.inspectMarks.find((m) => m.ind.id === id);
          if (mark) this.openInspect(mark.ind);
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
    this.input.keyboard!.on("keydown-ESC", () => {
      if (this.helpOpen) this.toggleHelp();
      else if (this.dialogOpen) this.closeDialog();
      else if (this.techPanelOpen) this.closeTechPanel();
      else if (this.inspectOpen) this.closeInspect();
      else this.cancelBuild();
    });
    this.input.keyboard!.on("keydown-L", () => this.toggleQuestLog());
    this.input.keyboard!.on("keydown-T", () => this.toggleTechPanel());
    this.input.keyboard!.on("keydown-M", () => this.toggleMute());
    this.input.keyboard!.on("keydown-H", () => this.toggleHelp());
    this.input.keyboard!.on("keydown-E", () => this.interact()); // talk to a nearby villager
    this.input.keyboard!.on("keydown-ENTER", () => this.confirm()); // place / reply / study
    // Any key press is a user gesture (enables audio); "?" toggles help and the
    // number row drives the build bar / dialog replies / research rows.
    this.input.keyboard!.on("keydown", (e: KeyboardEvent) => {
      this.audio.resume();
      if (e.key === "?") this.toggleHelp();
      else if (e.key >= "1" && e.key <= "9") this.handleDigit(Number(e.key));
    });

    // Resuming a saved session: the sim carries the WorldScene's view blob (null
    // on a fresh run or a pre-v3 save), so restore the interactive state on top
    // of the freshly-built world.
    const view = this.ctrl.sim.view as WorldView | null;
    if (view) this.applyView(view);

    // First run only: teach the core loop with a dismissible staged overlay.
    if (!view && !tutorialSeen()) this.startTutorial();
  }

  private key(name: string): Phaser.Input.Keyboard.Key {
    return this.input.keyboard!.addKey(name);
  }

  // ── keyboard-only interaction ────────────────────────────────────────────────

  /** E: open a conversation with the nearest villager — talk without a mouse. */
  private interact(): void {
    if (this.helpOpen || this.dialogOpen || this.techPanelOpen || this.inspectOpen || this.buildMode)
      return;
    const npc = this.nearestNpc(56);
    if (npc) this.openDialog(npc.ind);
    else this.flash("No one nearby to talk to");
  }

  /** Enter: confirm the active context — pick the first reply, study, or place. */
  private confirm(): void {
    if (this.helpOpen) return;
    if (this.dialogOpen) this.selectChoice(0);
    else if (this.techPanelOpen) this.study();
    else if (this.buildMode) this.tryPlace(this.ghost.x, this.ghost.y);
  }

  /** A number-row press, routed to whatever is in focus (dialog/research/build). */
  private handleDigit(n: number): void {
    if (this.helpOpen) return;
    if (this.dialogOpen) {
      this.selectChoice(n - 1);
      return;
    }
    if (this.techPanelOpen) {
      const id = this.ctrl.sim.state.knowledge.available().slice(0, 6)[n - 1];
      if (id) this.chooseTech(id);
      return;
    }
    const t = BUILD_TYPES[n - 1];
    if (t) this.toggleBuild(t.id, true);
  }

  /** Nearest villager to the chieftain within range — the one E talks to. */
  private nearestNpc(range: number): Npc | null {
    let best: Npc | null = null;
    let bestD = range;
    for (const n of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, n.sprite.x, n.sprite.y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  /** Build the controls/help overlay from the shared {@link CONTROLS} listing. */
  private buildHelpOverlay(): void {
    const w = 392;
    const rowH = 18;
    const h = 52 + CONTROLS.length * rowH;
    const panel = this.add.rectangle(0, 0, w, h, 0x10140d, 0.96).setStrokeStyle(2, 0xffe08a);
    const title = this.add
      .text(-w / 2 + 16, -h / 2 + 12, "Controls", {
        fontFamily: "monospace",
        fontSize: "15px",
        color: "#ffe08a",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    const body = CONTROLS.map((c) => `${c.keys.padEnd(15)} ${c.action}`).join("\n");
    const text = this.add
      .text(-w / 2 + 16, -h / 2 + 40, body, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#e9e0c8",
        lineSpacing: 6,
      })
      .setOrigin(0, 0);
    const hint = this.add
      .text(0, h / 2 - 8, "? or H or Esc to close", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#9fb08a",
      })
      .setOrigin(0.5, 1);
    this.helpOverlay = this.add
      .container(VIEW_W / 2, VIEW_H / 2, [panel, title, text, hint])
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 8)
      .setVisible(false);
  }

  /** Show or hide the controls/help overlay (? or H). */
  private toggleHelp(): void {
    this.helpOpen = !this.helpOpen;
    this.helpOverlay.setVisible(this.helpOpen);
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
    this.fogRemaining = this.fog.length;
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

    this.researchHud = this.add
      .text(10, 52, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#bfe0ff",
        backgroundColor: "#00000066",
        padding: { x: 6, y: 3 },
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH);

    this.cultureHud = this.add
      .text(10, 74, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d9b3ff",
        backgroundColor: "#00000066",
        padding: { x: 6, y: 3 },
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH);

    this.leaderHud = this.add
      .text(10, 96, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffe54a",
        backgroundColor: "#00000066",
        padding: { x: 6, y: 3 },
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH);

    this.econHud = this.add
      .text(10, 118, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#cfe8b0",
        backgroundColor: "#00000066",
        padding: { x: 6, y: 3 },
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH);

    this.gatherPrompt = this.add
      .text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#dff0c0",
        backgroundColor: "#000000aa",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH)
      .setVisible(false);

    this.ritualPrompt = this.add
      .text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#e8d0ff",
        backgroundColor: "#000000aa",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH)
      .setVisible(false);

    this.giftPrompt = this.add
      .text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#cfe0a8",
        backgroundColor: "#000000aa",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH)
      .setVisible(false);

    this.raidBanner = this.add
      .text(VIEW_W / 2, 46, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffd2c2",
        backgroundColor: "#5a1410cc",
        padding: { x: 8, y: 4 },
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 4)
      .setVisible(false);

    this.raidPrompt = this.add
      .text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#ffd2c2",
        backgroundColor: "#000000aa",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH)
      .setVisible(false);

    this.add
      .text(VIEW_W / 2, 28, "WASD move · E talk · Space gather · 1/2/3 build + Enter · R ritual · G gift · F rally · L quests · T research · M sound · ? help", {
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

    // Sound toggle (also "M"): starts unmuted, but audio stays silent until a
    // user gesture resumes it per browser autoplay rules.
    this.muteBtn = this.add
      .text(VIEW_W - 8, 8, "🔊", {
        fontFamily: "monospace",
        fontSize: "14px",
        backgroundColor: "#00000066",
        padding: { x: 5, y: 3 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH)
      .setInteractive({ useHandCursor: true });
    this.muteBtn.setData("muteBtn", true);
  }

  /** Flip the sound on/off and reflect it on the HUD button. */
  private toggleMute(): void {
    this.muteBtn.setText(this.audio.toggleMute() ? "🔇" : "🔊");
  }

  private buildDialog(): void {
    const w = DIALOG_W;
    const h = DIALOG_H;
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
      .text(w / 2 - 12, h / 2 - 10, "press 1–9 or click a reply · Esc to leave", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#9fb08a",
      })
      .setOrigin(1, 1);
    this.dialog = this.add
      .container(DIALOG_X, DIALOG_Y, [panel, this.dialogName, this.dialogBody, hint])
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
    this.talkedTo.add(ind.id); // every conversation counts toward "talk to N villagers"
    const q = this.quests.find((x) => x.giverId === ind.id && x.state !== "done");
    const notable = notableById(this.ctrl.sim.living).get(ind.id)?.[0];
    const node = buildDialogue({
      ind,
      era: this.ctrl.sim.state.era,
      notable: notable && { title: notable.title, detail: notable.detail },
      quest: q && {
        desc: q.desc,
        state: q.state,
        reward: q.reward,
        progress: this.questProgress(q),
        target: q.target,
      },
      seed: ind.id,
      onAccept: () => q && this.acceptQuest(q),
      onTurnIn: () => q && this.turnInQuest(q),
    });
    this.dialogName.setText(individualName(ind));
    this.showNode(node);
    this.dialog.setVisible(true);
    this.dialogOpen = true;
    this.hoverLabel.setVisible(false);
  }

  /** Render one conversation beat: body line + a clickable row per choice. */
  private showNode(node: DialogNode): void {
    this.dialogNode = node;
    this.dialogBody.setText(node.body);
    this.dialogChoices.forEach((c) => c.destroy());
    this.dialogChoices = [];
    // Choices stack below the body, in screen space so hit-testing is simple.
    const left = DIALOG_X - DIALOG_W / 2 + 20;
    const bodyBottom = DIALOG_Y - DIALOG_H / 2 + 34 + this.dialogBody.height;
    node.choices.forEach((choice, i) => {
      const row = this.add
        .text(left, bodyBottom + 10 + i * 18, `${i + 1}. ${choice.label}`, {
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#cfe0a8",
        })
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(UI_DEPTH + 2)
        .setInteractive({ useHandCursor: true });
      row.setData("choiceIdx", i);
      row.on("pointerover", () => row.setColor("#ffe08a"));
      row.on("pointerout", () => row.setColor("#cfe0a8"));
      this.dialogChoices.push(row);
    });
  }

  /** Run the picked choice's effect, then advance to its node or close. */
  private selectChoice(idx: number): void {
    const choice = this.dialogNode?.choices[idx];
    if (!choice) return;
    const next = choice.next();
    if (next) this.showNode(next);
    else this.closeDialog();
  }

  /** Accept an available quest: set it running and snapshot its progress. */
  private acceptQuest(q: Quest): void {
    q.state = "active";
    q.start = questMetric(q, this.questMetrics());
    this.flash(`Task accepted: ${q.desc}`);
    this.audio.questAccept();
    this.tutorialEvent("quest");
  }

  /** Turn in a ready quest: mark it done and pay out the reward. */
  private turnInQuest(q: Quest): void {
    q.state = "done";
    this.ctrl.sim.state.resources[q.reward.res] += q.reward.amount;
    this.flash(`Quest complete! +${q.reward.amount} ${q.reward.res}`);
    this.audio.questComplete();
  }

  private closeDialog(): void {
    this.dialog.setVisible(false);
    this.dialogOpen = false;
    this.dialogNode = null;
    this.dialogChoices.forEach((c) => c.destroy());
    this.dialogChoices = [];
  }

  // ── building ───────────────────────────────────────────────────────────────

  private buildBuildBar(): void {
    // Bigger buttons = easier hit targets; a corner badge shows the 1/2/3 shortcut.
    const y = VIEW_H - 50;
    BUILD_TYPES.forEach((t, i) => {
      const bx = 10 + i * 74;
      const bg = this.add
        .rectangle(bx, y, 70, 40, 0x12180e, 0.78)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x6f8c5a)
        .setScrollFactor(0)
        .setDepth(UI_DEPTH)
        .setInteractive({ useHandCursor: true });
      bg.setData("buildBtn", t.id);
      this.add
        .text(bx + 5, y + 3, `${i + 1}`, {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#ffe08a",
          fontStyle: "bold",
        })
        .setScrollFactor(0)
        .setDepth(UI_DEPTH + 2);
      this.add
        .image(bx + 16, y + 25, t.icon)
        .setDisplaySize(18, 18)
        .setScrollFactor(0)
        .setDepth(UI_DEPTH + 1);
      this.add
        .text(bx + 29, y + 6, `${t.label}\n${t.cost.amount} ${t.cost.res}`, {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#e9e0c8",
          lineSpacing: 2,
        })
        .setScrollFactor(0)
        .setDepth(UI_DEPTH + 1);
      this.buildBtns.push({ type: t, bg });
    });
  }

  // ── save / load ──────────────────────────────────────────────────────────────

  /** Two HUD buttons, just right of the build bar, to save and reload the run. */
  private buildSaveBar(): void {
    const y = VIEW_H - 50;
    const x0 = 10 + BUILD_TYPES.length * 74 + 6; // sit beside the build bar
    const mk = (i: number, label: string, key: string): void => {
      const bx = x0 + i * 58;
      const bg = this.add
        .rectangle(bx, y, 54, 40, 0x12180e, 0.78)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x6f8c5a)
        .setScrollFactor(0)
        .setDepth(UI_DEPTH)
        .setInteractive({ useHandCursor: true });
      bg.setData(key, true);
      this.add
        .text(bx + 27, y + 20, label, {
          fontFamily: "monospace",
          fontSize: "12px",
          color: "#e9e0c8",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(UI_DEPTH + 1);
    };
    mk(0, "Save", "saveBtn");
    mk(1, "Load", "loadBtn");
  }

  /** Persist the run: stash the WorldScene's view on the sim, then save it all. */
  private saveGame(): void {
    this.ctrl.sim.view = this.captureView();
    this.ctrl.save();
    this.flash("Game saved");
  }

  /** Reload the saved run and rebuild the world from it (scene restart). */
  private loadGame(): void {
    if (!this.ctrl.hasSave()) {
      this.flash("No save found");
      return;
    }
    if (this.ctrl.load()) this.scene.restart();
    else this.flash("Load failed");
  }

  /** Snapshot the interactive session into the sim's opaque {@link WorldView}. */
  private captureView(): WorldView {
    const fog: number[] = [];
    for (let i = 0; i < this.fogRevealed.length; i++) if (this.fogRevealed[i]) fog.push(i);
    const farms = this.gatherables
      .filter((g) => g.farm)
      .map((g) => ({ kind: "farm" as const, x: g.sprite.x, y: g.sprite.y, amount: g.amount }));
    return {
      player: { x: this.player.x, y: this.player.y },
      gathered: { ...this.gathered },
      housing: this.housing,
      farmsBuilt: this.farmsBuilt,
      farmHarvests: this.farmHarvests,
      talkedTo: [...this.talkedTo],
      regionExplored: { ...this.regionExplored },
      quests: this.quests.map((q) => ({ giverId: q.giverId, desc: q.desc, state: q.state, start: q.start })),
      fog,
      buildings: [...this.placed.map((b) => ({ ...b, amount: 0 })), ...farms],
    };
  }

  /** Restore a captured {@link WorldView} onto the freshly-built world. */
  private applyView(view: WorldView): void {
    // Player position; clear transient movement so it does not drift after load.
    this.player.setPosition(view.player.x, view.player.y).setDepth(view.player.y);
    this.vx = 0;
    this.vy = 0;
    this.moveTarget = null;
    this.cameras.main.centerOn(view.player.x, view.player.y);

    // Placed buildings — recreate sprites + structural side-effects.
    for (const b of view.buildings) this.spawnBuilding(b.kind, b.x, b.y, b.amount);

    // Gather / quest progress counters.
    this.gathered = { ...view.gathered };
    this.housing = view.housing;
    this.farmsBuilt = view.farmsBuilt;
    this.farmHarvests = view.farmHarvests;
    this.talkedTo = new Set(view.talkedTo);
    this.regionExplored = { ...view.regionExplored };

    // Quest states, matched to this run's givers (npcs reload identically).
    for (const sq of view.quests) {
      const q = this.quests.find((x) => x.giverId === sq.giverId && x.desc === sq.desc);
      if (q) {
        q.state = sq.state;
        q.start = sq.start;
      }
    }

    // Fog reveal — lift the saved cells outright (no tween, no region re-credit).
    for (const i of view.fog) {
      if (i >= 0 && i < this.fogRevealed.length && !this.fogRevealed[i]) {
        this.fogRevealed[i] = true;
        this.fogRemaining--;
        this.fog[i].setAlpha(0);
      }
    }
  }

  /** Clear every per-run collection so create() rebuilds cleanly on restart. */
  private resetWorldState(): void {
    this.npcs = [];
    this.inspectMarks = [];
    this.notableMap = new Map();
    this.fog = [];
    this.fogRevealed = [];
    this.fogRemaining = 0;
    this.solids = [];
    this.gatherables = [];
    this.campfires = [];
    this.nightLights = [];
    this.placed = [];
    this.quests = [];
    this.questMarkers = new Map();
    this.exploreRegions = [];
    this.regionExplored = {};
    this.buildBtns = [];
    this.housing = 0;
    this.farmsBuilt = 0;
    this.farmHarvests = 0;
    this.gathered = { wood: 0, food: 0, stone: 0 };
    this.talkedTo = new Set();
  }

  private toggleBuild(id: string, keyboard = false): void {
    const t = BUILD_TYPES.find((b) => b.id === id);
    if (!t) return;
    if (this.buildMode?.id === id) {
      this.cancelBuild();
      return;
    }
    this.buildMode = t;
    this.buildAimKeyboard = keyboard;
    this.ghost.setTexture(t.icon).setVisible(true);
    this.ghostTile.setVisible(true);
    this.ghostMark.setVisible(true);
    this.highlightBuildBtns();
    if (keyboard) this.updateBuildAim(); // snap the ghost to the chieftain at once
  }

  private cancelBuild(): void {
    this.buildMode = null;
    this.ghost.setVisible(false);
    this.ghostTile.setVisible(false);
    this.ghostMark.setVisible(false);
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
    this.buildAimKeyboard = false; // moving the mouse takes over aiming
    this.positionGhost(this.snap(p.worldX), this.snap(p.worldY));
  }

  /** When aiming a build from the keyboard, keep the ghost on the tile just in
   *  front of the chieftain's feet so it can be placed without a mouse. */
  private updateBuildAim(): void {
    if (!this.buildMode || !this.buildAimKeyboard) return;
    this.positionGhost(this.snap(this.player.x), this.snap(this.player.y + TILE));
  }

  /** Move the build ghost + footprint to a snapped tile and tint by affordability. */
  private positionGhost(wx: number, wy: number): void {
    if (!this.buildMode) return;
    this.ghost.setPosition(wx, wy);
    this.ghostTile.setPosition(wx, wy);
    const cost = this.buildMode.cost;
    const ok = this.ctrl.sim.state.resources[cost.res] >= cost.amount;
    // Green = affordable, red = not. Affordable also reads brighter/solider.
    const col = ok ? 0x66ff66 : 0xff5a5a;
    this.ghost.setTint(col).setAlpha(ok ? 0.75 : 0.5);
    this.ghostTile.setFillStyle(col, 0.22).setStrokeStyle(1.5, col, 0.9);
    // Redundant glyph so the affordability read survives red/green colourblindness.
    const mark = BUILD_MARKER[ok ? "ok" : "blocked"];
    this.ghostMark.setPosition(wx, wy).setText(mark.glyph).setColor(mark.color);
  }

  private tryPlace(wx: number, wy: number): void {
    const t = this.buildMode;
    if (!t) return;
    const res = this.ctrl.sim.state.resources;
    if (res[t.cost.res] < t.cost.amount) {
      this.denyBuild(`Not enough ${t.cost.res}`);
      return;
    }
    res[t.cost.res] -= t.cost.amount;
    if (t.id === "farm") {
      this.spawnBuilding("farm", wx, wy, 12);
      this.farmsBuilt += 1;
      this.flash("Farm built — Space to harvest food");
    } else if (t.id === "hut") {
      this.spawnBuilding("hut", wx, wy, 0);
      this.housing += 1; // shelter for more of the tribe
      this.flash("Hut built — +1 housing");
      this.tutorialEvent("build");
    } else {
      this.spawnBuilding("campfire", wx, wy, 0);
      this.flash("Campfire built — warmth");
    }
    this.dustBurst(wx, wy); // a kick of dust as it lands
    this.audio.build(true);
    this.positionGhost(wx, wy); // refresh the affordability tint after spending
  }

  /**
   * Create a placed building's sprite and structural side-effects — but not the
   * resource charge, counters or placement juice. Shared by {@link tryPlace} and
   * save-load restore so a loaded world rebuilds exactly what was built.
   */
  private spawnBuilding(kind: "campfire" | "hut" | "farm", wx: number, wy: number, amount: number): void {
    if (kind === "farm") {
      // A farm is flat ground you walk over — and a renewable food source.
      const crop = this.add.image(wx, wy, "crop").setDepth(2);
      this.raiseIn(crop);
      this.gatherables.push({ sprite: crop, kind: "food", amount, farm: true });
      return;
    }
    const icon = kind === "hut" ? "shelter-hut" : "fire-0";
    const spr = this.add.image(wx, wy, icon).setOrigin(0.5, 0.9).setDepth(wy);
    this.raiseIn(spr);
    if (kind === "hut") {
      this.solids.push({ x: wx, y: wy, r: 10 });
      this.addNightGlow(wx, wy - 6, 30, 22, 0xffd27a, 0.45, false); // a lit window after dark
    } else {
      this.addNightGlow(wx, wy, 72, 42, 0xffb066, 0.5, true); // campfire's warm glow, lit at night
      this.campfires.push({ x: wx, y: wy }); // villagers will gather here after dark
    }
    this.placed.push({ kind, x: wx, y: wy });
  }

  /** Refuse a placement loudly: reason text, a red ghost shake, and a low buzz. */
  private denyBuild(reason: string): void {
    this.flash(reason);
    this.audio.build(false);
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
    if (!this.onScreen(x, y)) return;
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

  // ── tutorial ─────────────────────────────────────────────────────────────

  /** Build the dismissible staged overlay and arm the first step. */
  private startTutorial(): void {
    const w = 452;
    const h = 56;
    const panel = this.add.rectangle(0, 0, w, h, 0x141c12, 0.94).setStrokeStyle(2, 0xffe08a);
    this.tutorialText = this.add
      .text(-w / 2 + 12, -h / 2 + 9, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#fff4d6",
        wordWrap: { width: w - 84 },
        lineSpacing: 3,
      })
      .setOrigin(0, 0);
    const skip = this.add
      .text(w / 2 - 12, 0, "Skip ▸", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#9fb08a",
        backgroundColor: "#00000066",
        padding: { x: 6, y: 4 },
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    skip.setData("tutorialSkip", true);
    this.tutorialCard = this.add
      .container(VIEW_W / 2, 78, [panel, this.tutorialText, skip])
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 10); // above the dialog so Skip is always reachable
    this.tutorialStep = 0;
    this.renderTutorial();
  }

  /** Show the current step's number and instruction. */
  private renderTutorial(): void {
    const s = TUTORIAL_STEPS[this.tutorialStep];
    if (!s) return;
    this.tutorialText.setText(`Step ${this.tutorialStep + 1}/${TUTORIAL_STEPS.length}\n${s.text}`);
  }

  /** A player action; clears the current step if it's the one we're waiting on. */
  private tutorialEvent(event: TutorialEvent): void {
    if (this.tutorialStep < 0) return;
    const next = advanceTutorial(this.tutorialStep, event);
    if (next === this.tutorialStep) return;
    this.tutorialStep = next;
    if (next >= TUTORIAL_STEPS.length) this.endTutorial(true);
    else this.renderTutorial();
  }

  /** Finish (or skip) the tutorial: persist 'seen' and fade the card away. */
  private endTutorial(completed: boolean): void {
    if (this.tutorialStep < 0) return;
    this.tutorialStep = -1;
    markTutorialSeen();
    if (completed) this.flash("Tutorial complete — explore freely!");
    const card = this.tutorialCard;
    if (card) {
      this.tutorialCard = null;
      this.tweens.add({
        targets: card,
        alpha: 0,
        duration: 300,
        onComplete: () => card.destroy(),
      });
    }
  }

  // ── per-frame ──────────────────────────────────────────────────────────────

  override update(_t: number, dt: number): void {
    this.ctrl.update(dt); // keeps the world model alive (no-op while paused)
    this.movePlayer(dt);
    this.updateBuildAim();
    this.updateNpcs(dt);
    this.updateGather(dt);
    this.updateRitual(dt);
    this.updateDiplomacy(dt);
    this.updateRaid(dt);
    this.updateEconomy(dt);
    this.updateQuests();
    this.updateInspectMarks();
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
    // One explore region per "explore" spec — placed out in the fog so there is
    // something to scout. The display name doubles as the region's key.
    const ridge: Region = { name: "the eastern ridge", x: WORLD_W - 220, y: CAMP.y, r: 150 };
    this.exploreRegions.push(ridge);

    const specs: QuestSpec[] = [
      { desc: "Gather 5 wood", kind: "gather", res: "wood", target: 5, reward: { res: "food", amount: 12 } },
      { desc: "Build a Farm", kind: "build", build: "farm", target: 1, reward: { res: "wood", amount: 15 } },
      { desc: "Gather 4 stone", kind: "gather", res: "stone", target: 4, reward: { res: "food", amount: 15 } },
      { desc: `Scout ${ridge.name}`, kind: "explore", region: ridge.name, target: 6, reward: { res: "stone", amount: 8 } },
      { desc: "Talk to 3 villagers", kind: "talk", target: 3, reward: { res: "food", amount: 10 } },
      { desc: "Harvest 3 food from a farm", kind: "harvest", target: 3, reward: { res: "wood", amount: 12 } },
    ];
    // Spread the givers across the band; step keeps them distinct even if the
    // band is small (the golden-angle spawn already scatters them in space).
    const step = Math.max(1, Math.floor(this.npcs.length / specs.length));
    specs.forEach((s, i) => {
      const giver = this.npcs[i * step];
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

  /** The live counters every quest's progress is read from. */
  private questMetrics(): QuestMetrics {
    return {
      gathered: this.gathered,
      housing: this.housing,
      farmsBuilt: this.farmsBuilt,
      villagersTalked: this.talkedTo.size,
      farmHarvests: this.farmHarvests,
      regionExplored: this.regionExplored,
    };
  }

  /** How far along an accepted quest is, measured against its accept-time snapshot. */
  private questProgress(q: Quest): number {
    return questMetric(q, this.questMetrics()) - q.start;
  }

  private updateQuests(): void {
    // Snapshot the live counters once per frame, not once per quest: questProgress
    // would otherwise rebuild a metrics object on every call (twice per quest).
    const metrics = this.questMetrics();
    const progress = (q: Quest) => questMetric(q, metrics) - q.start;
    let tracker = "";
    for (const q of this.quests) {
      if (q.state === "active" && progress(q) >= q.target) q.state = "ready";
      const marker = this.questMarkers.get(q.giverId);
      const giver = this.npcs.find((n) => n.ind.id === q.giverId);
      if (marker && giver) {
        // Colourblind-safe: a distinct glyph AND colour per state, not hue alone.
        const style =
          q.state === "available"
            ? QUEST_MARKER.available
            : q.state === "ready"
              ? QUEST_MARKER.ready
              : null;
        const bob = Math.sin(this.time.now / 250) * 2;
        if (style) {
          marker
            .setText(style.glyph)
            .setColor(style.color)
            .setVisible(true)
            .setPosition(giver.sprite.x, giver.sprite.y - giver.sprite.displayHeight + bob)
            .setDepth(giver.sprite.y + 1);
        } else {
          marker.setVisible(false);
        }
      }
      if (!tracker && (q.state === "active" || q.state === "ready")) {
        const who = this.giverName(q.giverId);
        tracker =
          q.state === "ready"
            ? `◆ ${q.desc} — done! return to ${who}`
            : `◆ ${who}: ${q.desc} — ${Math.min(progress(q), q.target)}/${q.target}`;
      }
    }
    if (!tracker) {
      tracker = this.quests.some((q) => q.state === "available")
        ? "◆ Find a villager marked ! for a task"
        : "◆ All tasks done — explore freely";
    }
    this.objText.setText(tracker);
    if (this.questLogOpen) this.refreshQuestLog();
  }

  // ── quest log panel ────────────────────────────────────────────────────────

  private buildQuestLog(): void {
    const w = 300;
    const x = VIEW_W - w / 2 - 10;
    const y = 96;
    const panel = this.add.rectangle(0, 0, w, 8, 0x141c12, 0.94).setStrokeStyle(2, 0x6f8c5a).setOrigin(0.5, 0);
    const title = this.add
      .text(-w / 2 + 12, 8, "Quest Log  (L)", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#ffe08a",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.questLogText = this.add
      .text(-w / 2 + 12, 30, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#e9e0c8",
        wordWrap: { width: w - 24 },
        lineSpacing: 4,
      })
      .setOrigin(0, 0);
    // The panel height tracks the text so the border always wraps the list.
    this.questLog = this.add
      .container(x, y, [panel, title, this.questLogText])
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 2)
      .setVisible(false);
    this.questLog.setData("panel", panel);
  }

  private toggleQuestLog(): void {
    this.questLogOpen = !this.questLogOpen;
    this.questLog.setVisible(this.questLogOpen);
    if (this.questLogOpen) this.refreshQuestLog();
  }

  /** Redraw the log: every still-open quest with giver name + progress. */
  private refreshQuestLog(): void {
    const open = this.quests.filter((q) => q.state !== "done");
    const lines = open.map((q) => {
      const who = this.giverName(q.giverId);
      if (q.state === "available") return `• ${q.desc}\n   from ${who} — talk to accept (!)`;
      if (q.state === "ready") return `• ${q.desc}\n   ✓ done — return to ${who} (✓)`;
      const p = Math.min(this.questProgress(q), q.target);
      return `• ${q.desc}\n   ${who} — ${p}/${q.target}`;
    });
    this.questLogText.setText(lines.length ? lines.join("\n") : "All tasks done — explore freely.");
    const panel = this.questLog.getData("panel") as Phaser.GameObjects.Rectangle;
    panel.height = this.questLogText.height + 38; // wrap the title + list
  }

  // ── research (the lore-totem) ────────────────────────────────────────────────

  /** Light the camp hearth: the fire sprite, its night glow, and a gather hub. */
  private lightCampfire(): void {
    if (this.campFireLit) return;
    this.campFireLit = true;
    this.add.image(CAMP.x + 2, CAMP.y + 30, "fire-0").setDepth(CAMP.y + 30);
    this.addNightGlow(CAMP.x + 2, CAMP.y + 34, 84, 48, 0xffb066, 0.5, true);
    this.campfires.push({ x: CAMP.x + 2, y: CAMP.y + 30 });
  }

  /** A clickable lore-totem just off camp — the in-world handle for research. */
  private placeTotem(): void {
    const x = CAMP.x - 70;
    const y = CAMP.y + 48;
    const totem = this.add
      .image(x, y, "totem")
      .setOrigin(0.5, 1)
      .setDepth(y)
      .setInteractive({ useHandCursor: true });
    totem.setData("totem", true);
    this.solids.push({ x, y: y - 8, r: 9 });
    this.add
      .text(x, y - 34, "✦ Totem", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#bfe0ff",
        backgroundColor: "#00000066",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 1)
      .setDepth(y + 1);
  }

  private buildTechPanel(): void {
    // The static frame lives in a container; the interactive rows and Study
    // button are scene-level and rebuilt/destroyed per open (like dialog choices),
    // so nothing stays hit-testable once the panel is closed.
    const w = TECH_W;
    const h = TECH_H;
    const panel = this.add.rectangle(0, 0, w, h, 0x101820, 0.95).setStrokeStyle(2, 0x5f86a8);
    const title = this.add
      .text(-w / 2 + 14, -h / 2 + 9, "Research — the Totem (T)", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#bfe0ff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.techPanelBody = this.add
      .text(-w / 2 + 14, -h / 2 + 30, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#e9e0c8",
        wordWrap: { width: w - 28 },
        lineSpacing: 3,
      })
      .setOrigin(0, 0);
    const hint = this.add
      .text(w / 2 - 12, h / 2 - 10, "1–6 or click a tech · Enter to study · Esc to close", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#7f93a6",
      })
      .setOrigin(1, 1);
    this.techPanel = this.add
      .container(VIEW_W / 2, VIEW_H / 2 - 4, [panel, title, this.techPanelBody, hint])
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 1)
      .setVisible(false);
  }

  private toggleTechPanel(): void {
    if (this.techPanelOpen) this.closeTechPanel();
    else this.openTechPanel();
  }

  private openTechPanel(): void {
    if (this.dialogOpen) this.closeDialog();
    this.cancelBuild();
    this.techPanelOpen = true;
    this.techPanel.setVisible(true);
    this.refreshTechPanel();
  }

  private closeTechPanel(): void {
    this.techPanelOpen = false;
    this.techPanel.setVisible(false);
    this.techRows.forEach((r) => r.destroy());
    this.techRows = [];
  }

  /** Redraw the panel from the sim's live knowledge tree (header + tech rows). */
  private refreshTechPanel(): void {
    const sim = this.ctrl.sim;
    const k = sim.state.knowledge;
    const target = sim.state.researchTarget;
    let head = `Era: ${k.currentEra()}    Known: ${k.discovered.size}/${Object.keys(TECH_TREE).length}\n`;
    if (target && TECH_TREE[target]) {
      const def = TECH_TREE[target];
      const prog = Math.min(Math.floor(k.progress[target]), def.cost);
      head += `▸ ${def.name}  ${prog}/${def.cost}\n${def.blurb}`;
    } else {
      head += "▸ choose a tech below to direct the tribe's research";
    }
    this.techPanelBody.setText(head);

    this.techRows.forEach((r) => r.destroy());
    this.techRows = [];
    const left = VIEW_W / 2 - TECH_W / 2 + 18;
    const top = VIEW_H / 2 - 4 - TECH_H / 2 + 98;
    const avail = k.available();
    avail.slice(0, 6).forEach((id, i) => {
      const def = TECH_TREE[id];
      const sel = id === target;
      const row = this.add
        .text(left, top + i * 16, `${i + 1}. ${sel ? "●" : "○"} ${def.name}  (${def.cost} · ${def.era})`, {
          fontFamily: "monospace",
          fontSize: "11px",
          color: sel ? "#ffe08a" : "#cfe0a8",
        })
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(UI_DEPTH + 2)
        .setInteractive({ useHandCursor: true });
      row.setData("techId", id);
      row.on("pointerover", () => row.setColor("#ffffff"));
      row.on("pointerout", () => row.setColor(sel ? "#ffe08a" : "#cfe0a8"));
      this.techRows.push(row);
    });
    if (avail.length === 0) {
      this.techRows.push(
        this.add
          .text(left, top, "The whole tech tree is discovered — the journey is complete.", {
            fontFamily: "monospace",
            fontSize: "11px",
            color: "#9fb08a",
            wordWrap: { width: TECH_W - 36 },
          })
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(UI_DEPTH + 2),
      );
    }

    // The Study button is scene-level and rebuilt here, so it is gone when closed.
    const canStudy = !!target && Math.floor(sim.state.resources.food) >= STUDY_FOOD;
    this.studyBtn = this.add
      .text(
        left,
        VIEW_H / 2 - 4 + TECH_H / 2 - 26,
        target ? `Study  (−${STUDY_FOOD} food → +${STUDY_POINTS} insight)` : "Study  (choose a tech first)",
        {
          fontFamily: "monospace",
          fontSize: "12px",
          color: canStudy ? "#cfe0a8" : "#8a9477",
          backgroundColor: canStudy ? "#1d3320" : "#23291c",
          padding: { x: 6, y: 3 },
        },
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 2)
      .setInteractive({ useHandCursor: true });
    this.studyBtn.setData("studyBtn", true);
    this.techRows.push(this.studyBtn);
  }

  /** Pick the tech to research next (surfaces straight to the pure sim). */
  private chooseTech(id: TechId): void {
    this.ctrl.sim.setResearchTarget(id);
    this.refreshTechPanel();
  }

  /** Spend food to pour insight into the current target; reflect any discovery. */
  private study(): void {
    const sim = this.ctrl.sim;
    if (!sim.state.researchTarget) {
      this.flash("Pick a tech to research first");
      return;
    }
    if (Math.floor(sim.state.resources.food) < STUDY_FOOD) {
      this.flash(`Need ${STUDY_FOOD} food to study`);
      this.audio.build(false);
      return;
    }
    sim.state.resources.food -= STUDY_FOOD;
    const completed = sim.fundResearch(STUDY_POINTS);
    this.audio.build(true);
    if (completed) this.onTechDiscovered(completed);
    this.refreshTechPanel();
  }

  /** A freshly-researched tech: announce it and reflect its effect in the world. */
  private onTechDiscovered(id: TechId): void {
    const def = TECH_TREE[id];
    this.flash(def.unlocksEra ? `${def.name} — the ${def.unlocksEra} begins!` : `Discovered ${def.name}!`);
    if (id === "fire") this.lightCampfire(); // the hearth is lit the moment fire is known
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
    // Better tools mean more per swing: the harvest scales with the tribe's
    // researched gather multiplier (Stone Tools, Wild-Plant Gathering, the Wheel…).
    const mult = this.ctrl.sim.state.knowledge.aggregateEffects().gatherMult;
    const amt = Math.max(1, Math.round(mult));
    this.ctrl.sim.state.resources[node.kind] += amt;
    this.gathered[node.kind] += amt;
    if (node.farm) this.farmHarvests += amt; // food taken from a farm the player placed
    node.amount -= 1; // one swing depletes the node by one regardless of yield
    this.gatherCooldown = GATHER_COOLDOWN_MS;
    this.tutorialEvent("gather");

    const spr = node.sprite;
    const px = spr.x;
    const py = spr.y - spr.displayHeight * 0.5; // burst from the node's middle
    this.floatGain(px, py, `+${amt} ${node.kind}`, RES_TEXT[node.kind]);
    this.popParticles(px, py, RES_COLOR[node.kind]);
    this.audio.gather(node.kind);

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

  // ── survival economy ─────────────────────────────────────────────────────────

  /** Carrying capacity the player's placed huts contribute on top of the sim's. */
  private housingCapacity(): number {
    return this.housing * HUT_CAPACITY;
  }

  /**
   * Pace the slow survival economy. While a blocking overlay (tutorial, dialog,
   * a panel) is up the world holds its breath; otherwise, once per
   * {@link ECONOMY_TICK_MS}, the tribe eats the food the player has gathered,
   * the seasons turn, and births/deaths resolve — with the player's huts raising
   * the population ceiling. The food change is captured for the HUD trend readout.
   */
  private updateEconomy(dt: number): void {
    if (this.tutorialStep >= 0 || this.dialogOpen || this.techPanelOpen || this.inspectOpen) return;
    const sim = this.ctrl.sim;
    if (sim.living.length === 0) return; // the tribe is gone — nothing left to tick
    this.economyTimer += dt;
    if (this.economyTimer < ECONOMY_TICK_MS) return;
    this.economyTimer = 0;

    const foodBefore = sim.state.resources.food;
    const popBefore = sim.living.length;
    sim.economyTick(this.housingCapacity());
    this.foodTrend = sim.state.resources.food - foodBefore;

    // Surface the human stakes: a birth or a loss gets a quiet floating note.
    const popAfter = sim.living.length;
    if (popAfter > popBefore) this.flash(`A child is born — the tribe is ${popAfter} strong`);
    else if (popAfter < popBefore) this.flash(`${popBefore - popAfter} of the tribe lost`);
  }

  // ── belief (rituals at the campfire) ─────────────────────────────────────────

  /** Nearest campfire within range — the hearth a ritual can be held at. */
  private nearestCampfire(range: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = range;
    for (const f of this.campfires) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, f.x, f.y);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  /** Show the ritual prompt by a nearby fire and hold a ritual on R. */
  private updateRitual(dt: number): void {
    if (this.ritualCooldown > 0) this.ritualCooldown -= dt;
    if (this.dialogOpen || this.techPanelOpen || this.inspectOpen || this.buildMode) {
      this.ritualPrompt.setVisible(false);
      return;
    }
    const fire = this.nearestCampfire(RITUAL_RANGE);
    if (!fire) {
      this.ritualPrompt.setVisible(false);
      return;
    }
    const cam = this.cameras.main;
    const ready = this.ritualCooldown <= 0;
    this.ritualPrompt
      .setText(ready ? `R: hold a ritual (−${RITUAL_FOOD} food → belief)` : "…")
      .setAlpha(ready ? 1 : 0.6)
      .setPosition(fire.x - cam.scrollX, fire.y - cam.scrollY - 24)
      .setVisible(true);
    if (ready && Phaser.Input.Keyboard.JustDown(this.ritualKey)) this.ritual(fire);
  }

  /** Offer food at the fire to accrue the sim's existing Culture/belief track. */
  private ritual(fire: { x: number; y: number }): void {
    const sim = this.ctrl.sim;
    if (Math.floor(sim.state.resources.food) < RITUAL_FOOD) {
      this.flash(`Need ${RITUAL_FOOD} food to hold a ritual`);
      this.audio.build(false);
      return;
    }
    sim.state.resources.food -= RITUAL_FOOD;
    const before = sim.state.culture.level();
    sim.state.culture.accrue(RITUAL_CULTURE);
    this.ritualCooldown = RITUAL_COOLDOWN_MS;

    this.floatGain(fire.x, fire.y - 14, `+${RITUAL_CULTURE} belief`, "#d9b3ff");
    this.popParticles(fire.x, fire.y - 8, 0xb98cff);
    this.audio.build(true);
    if (sim.state.culture.level() > before) {
      this.onBeliefMilestone(sim.state.culture.stage()!, fire);
    }
    this.syncHud(); // reflect the new belief total at once
  }

  /** A belief stage just opened: announce it and burst a bright ring at the fire. */
  private onBeliefMilestone(stage: (typeof BELIEF_STAGES)[number], fire: { x: number; y: number }): void {
    this.flash(`The tribe embraces ${stage.name} — ${stage.blurb}`);
    this.popParticles(fire.x, fire.y - 8, 0xffd9a0);
    const ring = this.add
      .circle(fire.x, fire.y - 8, 6, 0xffe6b0, 0)
      .setStrokeStyle(2, 0xffe6b0, 0.9)
      .setDepth(FOG_DEPTH - 1);
    this.tweens.add({
      targets: ring,
      scale: 6,
      alpha: 0,
      duration: 620,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  // ── rivals (neighbour diplomacy) ─────────────────────────────────────────────

  /**
   * Surface the sim's dormant rivals data: give the first neighbour tribe a
   * reachable camp out in the world (a clearing away from the player's camp and
   * any terrain), label it with the tribe's name and current disposition, and add
   * its hut as a solid so the diplomacy spot reads as a real place.
   */
  private placeRivalCamp(): void {
    const rival = this.ctrl.sim.state.rivals[0];
    if (!rival) return;
    this.rival = rival;
    // Pick the first candidate clearing that is well clear of the player's camp
    // and any terrain solid; the spread guarantees a reachable spot in every biome.
    const candidates: [number, number][] = [
      [240, 240],
      [WORLD_W - 240, 240],
      [240, WORLD_H - 220],
      [WORLD_W - 240, WORLD_H - 220],
      [WORLD_W - 260, CAMP.y],
      [260, CAMP.y],
    ];
    let spot = candidates[0];
    for (const c of candidates) {
      const clearOfTerrain = !this.solids.some(
        (s) => Phaser.Math.Distance.Between(c[0], c[1], s.x, s.y) < s.r + 40,
      );
      if (clearOfTerrain && Phaser.Math.Distance.Between(c[0], c[1], CAMP.x, CAMP.y) > 360) {
        spot = c;
        break;
      }
    }
    const [x, y] = spot;
    this.rivalCamp = { x, y };
    this.add.image(x, y, "shelter-village").setOrigin(0.5, 0.9).setDepth(y);
    this.add.image(x - 30, y + 10, "shelter-hut").setOrigin(0.5, 0.9).setDepth(y + 10);
    this.solids.push({ x, y: y - 6, r: 16 });
    this.rivalLabel = this.add
      .text(x, y - 40, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#e9e0c8",
        align: "center",
        backgroundColor: "#00000088",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(y + 2);
    this.updateRivalLabel();
  }

  /** Redraw the neighbour camp's banner: name, disposition (their mood) and the
   *  player-built relations the gift action moves. */
  private updateRivalLabel(): void {
    const r = this.rival;
    if (!r || !this.rivalLabel) return;
    const d = dispositionStyle(r.disposition);
    this.rivalLabel
      .setText(`${r.name} · ${rivalRegion(r).name}\n${d.icon} ${d.label}  ·  relations ${r.relations.toFixed(2)}`)
      .setColor(d.color);
  }

  /** Show the gift prompt when near the neighbour camp and send a gift on G. */
  private updateDiplomacy(dt: number): void {
    if (this.giftCooldown > 0) this.giftCooldown -= dt;
    const camp = this.rivalCamp;
    if (!camp || this.dialogOpen || this.techPanelOpen || this.inspectOpen || this.buildMode) {
      this.giftPrompt.setVisible(false);
      return;
    }
    const near = Phaser.Math.Distance.Between(this.player.x, this.player.y, camp.x, camp.y) < GIFT_RANGE;
    if (!near) {
      this.giftPrompt.setVisible(false);
      return;
    }
    const cam = this.cameras.main;
    const ready = this.giftCooldown <= 0;
    this.giftPrompt
      .setText(ready ? `G: send a gift (−${GIFT_FOOD} food → relations warm)` : "…")
      .setAlpha(ready ? 1 : 0.6)
      .setPosition(camp.x - cam.scrollX, camp.y - cam.scrollY - 48)
      .setVisible(true);
    if (ready && Phaser.Input.Keyboard.JustDown(this.giftKey)) this.sendGift();
  }

  /** Offer food to the neighbour camp, warming the sim's player-relations score. */
  private sendGift(): void {
    const rival = this.rival;
    const camp = this.rivalCamp;
    if (!rival || !camp) return;
    const sim = this.ctrl.sim;
    if (Math.floor(sim.state.resources.food) < GIFT_FOOD) {
      this.flash(`Need ${GIFT_FOOD} food to send a gift`);
      this.audio.build(false);
      return;
    }
    sim.state.resources.food -= GIFT_FOOD;
    const before = rival.relations;
    shiftRelations(rival, GIFT_RELATIONS); // the sim's one place relations ever moves
    this.giftCooldown = GIFT_COOLDOWN_MS;
    const gained = rival.relations - before; // less than the delta once clamped at +1
    this.floatGain(
      camp.x,
      camp.y - 20,
      gained > 0.001 ? `+${gained.toFixed(2)} relations` : "relations maxed",
      "#a9cf6a",
    );
    this.popParticles(camp.x, camp.y - 12, 0x9fe070);
    this.audio.build(true);
    this.updateRivalLabel();
  }

  // ── interactive camp defence ─────────────────────────────────────────────────

  /**
   * Drive the raid event each frame. While idle, count down to the next sighting;
   * once a hostile party is marching, advance it toward the camp, let the chieftain
   * rally villagers during the window, and resolve the skirmish when it arrives.
   */
  private updateRaid(dt: number): void {
    if (!this.rival || !this.rivalCamp) return; // no neighbour surfaced → no raids

    if (!this.raidActive) {
      // Don't open a raid over a blocking panel/dialog; just hold the timer.
      if (this.dialogOpen || this.techPanelOpen || this.inspectOpen) return;
      this.raidTimer -= dt;
      if (this.raidTimer <= 0) this.startRaid();
      return;
    }

    // Active: march the party from its camp toward our hearth over the window.
    this.raidCountdown -= dt;
    const t = 1 - Math.max(0, this.raidCountdown) / RAID_WARN_MS;
    const party = this.raidParty;
    const start = this.raidStart;
    if (party && start) {
      party.x = Phaser.Math.Linear(start.x, CAMP.x, t);
      party.y = Phaser.Math.Linear(start.y, CAMP.y + 36, t);
      party.setDepth(party.y);
    }

    const secs = Math.max(0, Math.ceil(this.raidCountdown / 1000));
    this.raidBanner.setText(
      `⚔ ${this.rival.name} raid the camp — ${secs}s\nrallied ${this.rallied.size}  ·  hold the hearth, press F`,
    );

    // Rally: each press musters the nearest un-rallied villager to the hearth.
    const nearCamp =
      Phaser.Math.Distance.Between(this.player.x, this.player.y, CAMP.x, CAMP.y) < RALLY_RANGE;
    const cam = this.cameras.main;
    this.raidPrompt
      .setText(nearCamp ? "F: rally a villager to defend" : "Return to the hearth to rally!")
      .setAlpha(nearCamp ? 1 : 0.6)
      .setPosition(CAMP.x - cam.scrollX, CAMP.y - cam.scrollY - 56)
      .setVisible(true);
    if (nearCamp && Phaser.Input.Keyboard.JustDown(this.defendKey)) this.rallyVillager();

    if (this.raidCountdown <= 0) this.resolveRaidEvent();
  }

  /** Sight a hostile party at the neighbour camp and start the defend window. */
  private startRaid(): void {
    const rival = this.rival;
    const camp = this.rivalCamp;
    if (!rival || !camp) return;
    this.raidActive = true;
    this.raidCountdown = RAID_WARN_MS;
    this.rallied.clear();
    this.raidStart = { x: camp.x, y: camp.y };
    const key = ensureHomininTexture(this, {
      eraIdx: rival.eraIndex,
      modernity: 0.4,
      bulk: 0.85,
      fur: 0.6,
      skin: 2,
      hair: 1,
    });
    this.raidParty = this.add
      .image(camp.x, camp.y, key)
      .setOrigin(0.5, 1)
      .setScale(1.3)
      .setTint(0xff8a7a)
      .setDepth(camp.y);
    this.raidBanner.setVisible(true);
    this.flash(`${rival.name} are raiding! Rally at the hearth (F)`);
    this.audio.raidWarn();
  }

  /** Muster the nearest villager not yet defending to fall back to the hearth. */
  private rallyVillager(): void {
    let next: Npc | null = null;
    let bestD = Infinity;
    for (const n of this.npcs) {
      if (this.rallied.has(n.ind.id)) continue;
      const d = Phaser.Math.Distance.Between(n.sprite.x, n.sprite.y, CAMP.x, CAMP.y);
      if (d < bestD) {
        bestD = d;
        next = n;
      }
    }
    if (!next) {
      this.flash("The whole band is already defending!");
      return;
    }
    this.rallied.add(next.ind.id);
    // Send them to a ring around the hearth; updateNpcs walks them there.
    const a = Math.random() * Math.PI * 2;
    next.activity = "wander";
    next.tx = Phaser.Math.Clamp(CAMP.x + Math.cos(a) * 40, 30, WORLD_W - 30);
    next.ty = Phaser.Math.Clamp(CAMP.y + 30 + Math.sin(a) * 28, 50, WORLD_H - 20);
    next.workT = 0;
    this.floatGain(next.sprite.x, next.sprite.y - 18, "to arms!", "#ffd2c2");
    this.audio.build(true);
  }

  /**
   * The raiders arrive: resolve on the sim's own skirmish math (chieftain + rallied
   * band vs the rival, shielded by shelter tier and defensive tech) and apply the
   * fallout — the raiders take their losses, food is plundered on a poor defence.
   */
  private resolveRaidEvent(): void {
    const sim = this.ctrl.sim;
    const rival = this.rival;
    if (!rival) return;
    const defenders = 1 + this.rallied.size; // the chieftain always stands
    const sides = buildRaidSides(
      sim.state,
      sim.state.knowledge.aggregateEffects(),
      rival,
      defenders,
      sim.traitAverages().traits.strength,
    );
    const outcome = resolveRaid(sides, RAID_PLUNDER_FOOD);

    rival.population = outcome.raiderSurvivors; // raiders take their losses
    if (outcome.plunder > 0) {
      sim.state.resources.food = Math.max(0, sim.state.resources.food - outcome.plunder);
    }

    this.cameras.main.shake(260, 0.006);
    this.popParticles(CAMP.x, CAMP.y - 6, outcome.won ? 0x9fe070 : 0xff6a4a);
    this.audio.raidResolve(outcome.won);
    this.flash(
      outcome.won
        ? `${rival.name} are driven off! The camp holds.`
        : `${rival.name} broke through — ${outcome.plunder} food plundered.`,
    );
    this.endRaid();
  }

  /** Tear down the raid: retreat the party and arm the next quiet stretch. */
  private endRaid(): void {
    this.raidActive = false;
    this.raidCountdown = 0;
    this.raidTimer = RAID_REPEAT_MS;
    this.rallied.clear();
    this.raidStart = null;
    const party = this.raidParty;
    if (party) {
      this.raidParty = null;
      this.tweens.add({
        targets: party,
        alpha: 0,
        y: party.y - 14,
        duration: 420,
        onComplete: () => party.destroy(),
      });
    }
    this.raidBanner.setVisible(false);
    this.raidPrompt.setVisible(false);
  }

  /**
   * True when a world point is on (or near) screen. Decorative bursts skip
   * spawning entirely when off-screen, so no sprites or tweens are created for
   * effects the player can't see (e.g. a raid resolving at camp while they roam).
   */
  private onScreen(x: number, y: number): boolean {
    return isPointVisible(x, y, this.cameras.main.worldView, PARTICLE_CULL_MARGIN);
  }

  /** A small radial burst of fading dots at a world point — the gather "pop". */
  private popParticles(x: number, y: number, color: number): void {
    if (!this.onScreen(x, y)) return;
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
    if (!this.onScreen(x, y)) return;
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
      this.tutorialEvent("move");
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
      // Sound one footstep per half-bob, so each planted foot ticks once.
      const stepIdx = Math.floor(this.bobPhase / Math.PI);
      if (stepIdx !== this.lastStepIdx) {
        this.lastStepIdx = stepIdx;
        this.audio.footstep();
      }
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
    if (this.fogRemaining === 0) return; // whole map lifted — skip the scan entirely
    const px = this.player.x;
    const py = this.player.y;
    const reach = 150;
    const cols = Math.ceil(WORLD_W / FOG_CELL);
    const rows = Math.ceil(WORLD_H / FOG_CELL);
    // A cell can only flip when its centre is within `reach` of the player, which
    // also bounds it to within `reach` on each axis — so scan just that window of
    // cells around the player instead of every fog tile in the world. The inner
    // distance test still gates exactly, so the cells revealed are unchanged.
    const minC = Math.max(0, Math.floor((px - reach - FOG_CELL / 2) / FOG_CELL));
    const maxC = Math.min(cols - 1, Math.ceil((px + reach - FOG_CELL / 2) / FOG_CELL));
    const minR = Math.max(0, Math.floor((py - reach - FOG_CELL / 2) / FOG_CELL));
    const maxR = Math.min(rows - 1, Math.ceil((py + reach - FOG_CELL / 2) / FOG_CELL));
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const i = r * cols + c;
        if (this.fogRevealed[i]) continue;
        const cx = c * FOG_CELL + FOG_CELL / 2;
        const cy = r * FOG_CELL + FOG_CELL / 2;
        if (Phaser.Math.Distance.Between(px, py, cx, cy) < reach) {
          this.fogRevealed[i] = true;
          this.fogRemaining--;
          this.tweens.add({ targets: this.fog[i], alpha: 0, duration: 350 });
          // Credit any explore region this freshly-revealed cell falls within.
          for (const rg of this.exploreRegions) {
            if (Phaser.Math.Distance.Between(rg.x, rg.y, cx, cy) < rg.r) {
              this.regionExplored[rg.name] = (this.regionExplored[rg.name] ?? 0) + 1;
            }
          }
        }
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
    this.audio.setTimeOfDay(this.dayTime); // brighten/hush the ambient bed with the sky
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

    // Survival readout: which way the larder is trending, the tribe against the
    // ceiling the player's huts raise, and the season pressing on both.
    const eff = s.knowledge.aggregateEffects();
    eff.capacityBonus += this.housingCapacity();
    const cap = Math.round(this.ctrl.sim.carryingCapacity(eff));
    const pop = this.ctrl.sim.living.length;
    const trend = this.foodTrend > 0.05 ? "▲" : this.foodTrend < -0.05 ? "▼" : "▬";
    const net = `${this.foodTrend >= 0 ? "+" : ""}${this.foodTrend.toFixed(1)}`;
    const season = ["❄ Winter", "🌱 Spring", "☀ Summer", "🍂 Autumn"][s.world.seasonIndex] ?? "";
    // Outbreak risk: the sim's epidemic model, surfaced so the player can act on
    // it — crowding lifts it (huts raise capacity and thin the crowd), medicine
    // lowers it. `eff` already folds in the player's housing capacity bonus.
    const risk = outbreakRisk(this.ctrl.sim.epidemicSeverity(eff));
    this.econHud.setText(
      `Tribe ${trend} food ${net}/tick · 👥 ${pop}/${cap} · 🏠 ${this.housing} · ${season} · 🦠 ${risk.label} (${risk.pct})`,
    );

    const target = s.researchTarget;
    if (target && TECH_TREE[target]) {
      const def = TECH_TREE[target];
      const prog = Math.min(Math.floor(s.knowledge.progress[target]), def.cost);
      this.researchHud.setText(`🔬 ${def.name}  ${prog}/${def.cost}`);
    } else {
      this.researchHud.setText(
        s.knowledge.available().length ? "🔬 research: none — open the Totem (T)" : "🔬 all tech known",
      );
    }
    const c = s.culture;
    const stage = c.stage();
    const next = BELIEF_STAGES[c.level()]; // the next unreached stage, if any
    let belief = `🔥 Belief ${Math.floor(c.points)}`;
    if (stage) belief += ` · ${stage.name}`;
    belief += next ? `  (next: ${next.name} @ ${next.threshold})` : " · zenith";
    this.cultureHud.setText(belief);

    const leader = this.leaderId != null ? this.npcs.find((n) => n.ind.id === this.leaderId) : undefined;
    if (leader) {
      const b = leaderBonus(leader.ind);
      this.leaderHud
        .setText(`👑 ${individualName(leader.ind)} ${b.style} · ${this.leaderBonusLabel(b)}`)
        .setVisible(true);
    } else {
      this.leaderHud.setVisible(false);
    }
  }

  // ── leaders & notables ───────────────────────────────────────────────────

  /**
   * Surface the sim's dormant leadership/naming systems: resolve the band's
   * chieftain (preferring the sim's appointed leaderId when that individual is
   * present, else deriving it with the same {@link selectLeader} the sim uses)
   * and the standout individuals, then float a clickable marker over each.
   */
  private markNotables(): void {
    const present = new Set(this.npcs.map((n) => n.ind.id));
    const appointed = this.ctrl.sim.state.leaderId;
    this.leaderId =
      appointed != null && present.has(appointed)
        ? appointed
        : selectLeader(this.npcs.map((n) => n.ind));
    this.notableMap = notableById(this.ctrl.sim.living);

    for (const n of this.npcs) {
      const isLeader = n.ind.id === this.leaderId;
      if (!isLeader && !this.notableMap.has(n.ind.id)) continue;
      const marker = this.add
        .text(n.sprite.x, n.sprite.y, isLeader ? "👑" : "✦", {
          fontFamily: "monospace",
          fontSize: "15px",
          color: isLeader ? "#ffe54a" : "#bfe0ff",
        })
        .setOrigin(0.5, 1)
        .setInteractive({ useHandCursor: true });
      marker.setData("inspectId", n.ind.id);
      this.inspectMarks.push({ ind: n.ind, sprite: n.sprite, marker });
    }
  }

  /** Float each leader/notable marker above its (moving) villager, gently bobbing. */
  private updateInspectMarks(): void {
    const bob = Math.sin(this.time.now / 320) * 2;
    for (const m of this.inspectMarks) {
      m.marker
        .setPosition(m.sprite.x, m.sprite.y - m.sprite.displayHeight - 8 + bob)
        .setDepth(m.sprite.y + 2);
    }
  }

  private buildInspectCard(): void {
    const w = 320;
    const panel = this.add
      .rectangle(0, 0, w, 8, 0x141c12, 0.96)
      .setStrokeStyle(2, 0xffe08a)
      .setOrigin(0.5, 0);
    this.inspectName = this.add
      .text(-w / 2 + 14, 10, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#ffe08a",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.inspectBody = this.add
      .text(-w / 2 + 14, 34, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#e9e0c8",
        wordWrap: { width: w - 28 },
        lineSpacing: 4,
      })
      .setOrigin(0, 0);
    this.inspectCard = this.add
      .container(VIEW_W / 2, 70, [panel, this.inspectName, this.inspectBody])
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 3)
      .setVisible(false);
    this.inspectCard.setData("panel", panel);
  }

  /** Open the inspect card for a leader/notable: name, role, and trait bonus. */
  private openInspect(ind: Individual): void {
    if (this.dialogOpen) this.closeDialog();
    this.inspectName.setText(individualName(ind));
    this.inspectBody.setText(this.inspectText(ind));
    const panel = this.inspectCard.getData("panel") as Phaser.GameObjects.Rectangle;
    panel.height = this.inspectBody.y + this.inspectBody.height + 12;
    this.inspectCard.setVisible(true);
    this.inspectOpen = true;
    this.hoverLabel.setVisible(false);
  }

  private closeInspect(): void {
    this.inspectCard.setVisible(false);
    this.inspectOpen = false;
  }

  /** The inspect card's body: the chieftain's role + tribe-wide bonus, then any
   *  notable epithets — all read straight from the sim's leadership/naming data. */
  private inspectText(ind: Individual): string {
    const lines: string[] = [];
    if (ind.id === this.leaderId) {
      const b = leaderBonus(ind);
      lines.push(`Chieftain ${b.style}`);
      lines.push(`Leads by ${this.cap(b.trait)} — ${this.leaderBonusLabel(b)} for the whole tribe.`);
    }
    for (const note of this.notableMap.get(ind.id) ?? []) {
      lines.push(`${note.title} (${note.detail})`);
    }
    return lines.length ? lines.join("\n") : "A member of the tribe.";
  }

  /** Human-readable form of a leader's one tribe-wide lever, e.g. "+9% research". */
  private leaderBonusLabel(b: LeaderBonus): string {
    const lever =
      b.trait === "strength"
        ? { mult: b.defenseMult, name: "defense" }
        : b.trait === "intelligence"
          ? { mult: b.researchMult, name: "research" }
          : { mult: b.foodMult, name: "food" };
    return `+${Math.round(Math.abs(1 - lever.mult) * 100)}% ${lever.name}`;
  }

  private cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
