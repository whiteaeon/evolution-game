/** Heritable numeric traits. All values are normalized to [0, 1]. */
export const TRAITS = [
  "strength",
  "intelligence",
  "dexterity",
  "coldTolerance",
  "diseaseResistance",
  "speech",
] as const;

export type TraitName = (typeof TRAITS)[number];

/** A genome is one value per trait, each in [0, 1]. */
export type Genome = Record<TraitName, number>;

export type Sex = "f" | "m";

export interface Individual {
  id: number;
  genome: Genome;
  sex: Sex;
  /** Age in years (== ticks lived). */
  age: number;
  /** Generation index: founders are 0, each child is parentMax + 1. */
  generation: number;
  /** Parents, for the family tree. Founders & arriving kin have none. */
  motherId?: number;
  fatherId?: number;
  /** Ancestry mix accumulated from interbreeding, for flavor/render. */
  lineage?: Lineage;
  /** Per-individual needs, all [0, 1]. */
  food: number;
  warmth: number;
  health: number;
  alive: boolean;
  /** Whether this individual ate cooked food recently (drives intel pressure). */
  ateCooked: boolean;
}

/** Player-assignable jobs. `idle` individuals just consume. */
export const TASKS = ["gather", "hunt", "cook", "build", "research", "idle"] as const;
export type Task = (typeof TASKS)[number];
export type TaskAllocation = Record<Task, number>;

// ── Eras ─────────────────────────────────────────────────────────────────────

/** The full arc. Reaching "Information" is the win condition. */
export const ERAS = [
  "Paleolithic",
  "Neolithic",
  "Bronze Age",
  "Iron Age",
  "Classical",
  "Medieval",
  "Industrial",
  "Modern",
  "Information",
] as const;
export type Era = (typeof ERAS)[number];

// ── Technology ───────────────────────────────────────────────────────────────

export const TECHS = [
  // Paleolithic
  "stoneTools",
  "gestures",
  "fire",
  "gathering",
  "hunting",
  "cooking",
  "burial",
  "caveArt",
  "symbols",
  // Neolithic
  "agriculture",
  "pottery",
  "animalDomestication",
  "weaving",
  "calendar",
  "spokenLanguage",
  // Bronze Age
  "bronzeworking",
  "theWheel",
  "writing",
  "irrigation",
  "sailing",
  // Iron Age
  "ironworking",
  "masonry",
  "currency",
  "mathematics",
  "medicine",
  // Classical
  "philosophy",
  "engineering",
  "republic",
  "aqueduct",
  // Medieval
  "university",
  "windmill",
  "guilds",
  "gunpowder",
  "banking",
  // Industrial
  "steamPower",
  "printing",
  "machinery",
  "sanitation",
  // Modern
  "electricity",
  "telegraph",
  "automobile",
  // Information
  "electronics",
  "computing",
  "vaccines",
  "internet",
] as const;
export type TechId = (typeof TECHS)[number];

export type TechCategory =
  | "survival"
  | "food"
  | "craft"
  | "culture"
  | "language"
  | "science";

/**
 * Data-driven effects. Multiplicative fields default to 1 and multiply together
 * across all discovered techs; additive fields default to 0 and sum. This is the
 * BALANCE-block philosophy applied to tech: every tech's gameplay impact lives in
 * data, and the sim aggregates it generically — no per-tech conditionals.
 */
export interface TechEffects {
  gatherMult?: number;
  huntMult?: number;
  foodMult?: number;
  buildMult?: number;
  researchMult?: number;
  birthMult?: number;
  /** Multiplier (<1) on predator/raid lethality — defense. */
  defenseMult?: number;
  /** Fraction (0..1) reducing disease lethality + endemic load. */
  diseaseDefense?: number;
  /** Additive warmth, like fire/clothing/shelter. */
  warmth?: number;
  /** Additive carrying-capacity bonus. */
  capacityBonus?: number;
  /** Additive intelligence selection pressure (cooking, schooling…). */
  intelPressure?: number;
  /** Additive world-abundance bonus (irrigation, sailing → new lands). */
  abundance?: number;
}

export interface TechDef {
  id: TechId;
  name: string;
  era: Era;
  category: TechCategory;
  prereqs: TechId[];
  cost: number;
  effects: TechEffects;
  /** Raw resources that must be in stock (and are spent) to complete this tech. */
  resourceCost?: ResourceCost;
  /** If set, discovering this tech advances the world to that era. */
  unlocksEra?: Era;
  blurb: string;
}

// ── World / shelter / biome ──────────────────────────────────────────────────

export const SHELTERS = ["cave", "hut", "village", "town", "city"] as const;
export type Shelter = (typeof SHELTERS)[number];

export const BIOMES = ["tundra", "forest", "river", "grassland", "desert", "coast"] as const;
export type Biome = (typeof BIOMES)[number];

export interface Region {
  id: string;
  name: string;
  biome: Biome;
  /** Normalised map position in [0,1] for the map view + travel distance. */
  x: number;
  y: number;
}

/**
 * One settlement (camp). The tribe starts as a single home settlement; founding a
 * second camp splits off some people into a discovered region. Each settlement
 * keeps its own shelter, resources, members and task allocation and is subject to
 * its own local biome pressures, while the tribe's knowledge/culture stays shared
 * at the simulation level. Serialize-safe: every field is plain JSON data.
 */
export interface Settlement {
  id: string;
  name: string;
  region: string;
  biome: Biome;
  shelter: Shelter;
  resources: ResourcePools;
  /** The people who live here. The home settlement aliases SimState.individuals. */
  members: Individual[];
  /** Per-settlement task allocation: how many members do each job. */
  allocation: TaskAllocation;
}

export interface WorldState {
  /** Ice-age severity / ambient cold in [0, 1]. Higher = deadlier winters. */
  cold: number;
  /** Food abundance multiplier. */
  abundance: number;
  /** Seasonal phase 0..1 (cosmetic + modulates cold). */
  season: number;
  /** 0=winter,1=spring,2=summer,3=autumn. */
  seasonIndex: number;
}

// ── Events & encounters ──────────────────────────────────────────────────────

export type SimEventType =
  | "disease"
  | "predator"
  | "coldSnap"
  | "bounty"
  | "raid"
  | "discovery"
  | "milestone"
  | "encounter"
  | "choice"
  | "dialogue";

export interface SimEvent {
  type: SimEventType;
  tick: number;
  message: string;
}

/** Archetype hominin groups you can meet and interbreed with. */
export const LINEAGES = ["sapiens", "neanderthal", "denisovan"] as const;
export type Lineage = (typeof LINEAGES)[number];

export interface Encounter {
  lineage: Lineage;
  /** Trait leanings this group contributes when you interbreed. */
  message: string;
  /** Tick the offer expires if the player ignores it. */
  expiresTick: number;
}

/** Branching, choice-driven event chains the player resolves with a trade-off. */
export const EVENT_CHAINS = [
  "hardWinter",
  "sickCamp",
  "rivalCache",
  "prophet",
  "migrationOmen",
  "feud",
  "bountifulFlood",
  "stranger",
  "sacredSite",
] as const;
export type EventChainId = (typeof EVENT_CHAINS)[number];

/**
 * Periodic diplomacy events with a specific rival tribe. They share the
 * pending-choice mechanism with {@link EventChainId} but carry a `rivalId`, and
 * their outcomes adjust the rival's relations score (not just resources).
 */
export const DIPLOMACY_EVENTS = ["diploGift", "diploTension", "diploRequest", "diploTrade"] as const;
export type DiplomacyId = (typeof DIPLOMACY_EVENTS)[number];

export interface ChoiceOption {
  /** Button label. */
  label: string;
  /** Short trade-off hint shown to the player. */
  hint: string;
}

/**
 * A pending branching event. Mirrors {@link Encounter}: it sits on the state
 * until the player (or autopilot) resolves it, or it expires. Option 0 is always
 * the cautious choice; option 1 is the risky one.
 */
export interface PendingChoice {
  id: EventChainId | DiplomacyId;
  title: string;
  message: string;
  options: [ChoiceOption, ChoiceOption];
  /** Tick the offer expires if the player ignores it. */
  expiresTick: number;
  /** For diplomacy events: the rival tribe this choice concerns. */
  rivalId?: string;
}

/** Carryable raw resources gathered by workers, beyond food. */
export const GATHERED_RESOURCES = ["wood", "stone", "hide"] as const;
export type GatheredResource = (typeof GATHERED_RESOURCES)[number];
/** A bill of raw resources, e.g. a shelter or tech cost. */
export type ResourceCost = Partial<Record<GatheredResource, number>>;

export interface ResourcePools {
  food: number;
  materials: number;
  /** Progress toward the next shelter upgrade. */
  buildProgress: number;
  /** Carryable raw resources, gathered per-biome by builders/hunters. */
  wood: number;
  stone: number;
  hide: number;
}

export interface SimConfig {
  seed: number;
  startingPopulation: number;
  carryingCapacityBase: number;
  /** Std-dev of per-gene mutation noise applied on inheritance. */
  mutationRate: number;
  reproMinAge: number;
  reproMaxAge: number;
  maxAge: number;
  /** Ticks between random world events. */
  eventInterval: number;
  /** Baseline ambient cold; the biome of the current region adds to this. */
  baseCold: number;
  /** Stored food the tribe starts with. Defaults to 20. */
  startingFood?: number;
  /** Multiplier on random-event lethality (disease/predator/raid/cold). Defaults to 1. */
  eventLethality?: number;
  /** Additive world-abundance bonus baked into every tick. Defaults to 0. */
  abundanceBonus?: number;
  /** Region the tribe starts in (defaults to the tundra homeland). */
  startRegion?: string;
  /** Roguelite carry-over: small additive genome bonus for founders. */
  founderBonus?: Partial<Genome>;
}
