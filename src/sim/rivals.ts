import type { RNG } from "./rng.js";
import { REGIONS, regionById } from "./regions.js";
import { ERAS, type Biome, type Era } from "./types.js";

/**
 * Lightweight AI neighbour tribes that share the region map with the player.
 *
 * They are *pure simulation*: plain serialisable data evolved by simple, local
 * rules with their own RNG stream, so they never perturb the player's balance or
 * random stream. There are no diplomacy actions yet — only their presence and
 * their drift over time (growth/decline, slow tech advance, shifting mood).
 */
export interface RivalTribe {
  id: string;
  name: string;
  /** Region they call home (always a region the player did not start in). */
  homeRegion: string;
  /** Cached biome of {@link homeRegion}, for flavour/render. */
  biome: Biome;
  /** Headcount. Floors at {@link RIVAL_BALANCE.popFloor} so they stay present. */
  population: number;
  /** Martial / cultural might in [0, 1]. */
  strength: number;
  /** Their tech level, as an index into {@link ERAS}. */
  eraIndex: number;
  /** Progress toward the next era in [0, 1). */
  techProgress: number;
  /** Disposition toward the player: -1 hostile … 0 neutral … +1 friendly. */
  disposition: number;
  /**
   * Diplomatic standing the player has *built* with this tribe, in [-1, 1].
   * Unlike {@link disposition} (their intrinsic, drifting mood), this only moves
   * in response to diplomacy events the player resolves — so it is a pure,
   * deterministic record of the relationship.
   */
  relations: number;
}

/** Tunables for rival evolution, grouped so the balance is in one place. */
export const RIVAL_BALANCE = {
  /** How many neighbour tribes to spawn (capped by available regions). */
  count: 3,
  /** Population can never fall below this — a tribe is always *present*. */
  popFloor: 2,
  /** Logistic growth rate per tick. */
  growthRate: 0.05,
  /** Carrying-capacity model: base + strength + era contributions. */
  capBase: 10,
  capPerStrength: 26,
  capPerEra: 5,
  /** Per-tick chance of a setback (famine/raid) and its severity. */
  setbackChance: 0.04,
  setbackSeverity: 0.18,
  /** Strength mean-reverts toward this target (rising with era). */
  strengthBase: 0.3,
  strengthPerEra: 0.06,
  strengthPull: 0.05,
  strengthNoise: 0.02,
  /** Tech advance rate, scaled by strength and (capped) population. */
  techRate: 0.0025,
  techPopCap: 40,
  /** Disposition is a mean-reverting random walk toward neutral. */
  dispositionPull: 0.02,
  dispositionNoise: 0.03,
} as const;

/** Tunables for raids/skirmishes, grouped so the balance is in one place. */
export const RAID_BALANCE = {
  /** Relations at or below this make a rival hostile enough to raid. */
  hostileRelations: -0.5,
  /** Ticks between possible raids (timing drawn on the rival RNG stream). */
  raidInterval: 53,
  /** Max fraction of either side that can fall in a single skirmish. */
  maxLossFrac: 0.3,
  /** Player defensive rating gained per shelter tier (cave→city). */
  defensePerShelterTier: 0.25,
  /** Defensive rating a rival gains per era of their own tech. */
  defensePerEra: 0.2,
} as const;

/** One side of a skirmish: its martial might, numbers and defensive rating. */
export interface SkirmishSide {
  /** Martial might in [0, 1]. */
  strength: number;
  /** Headcount. */
  population: number;
  /** Defensive rating (>= 1); higher = better defended (shelter tier + tech). */
  defense: number;
}

export interface SkirmishResult {
  attackerPower: number;
  defenderPower: number;
  /** Fraction of the attacker lost, in [0, {@link RAID_BALANCE.maxLossFrac}]. */
  attackerLossFrac: number;
  /** Fraction of the defender lost, same bound. */
  defenderLossFrac: number;
}

/** Combat power: martial might and numbers, shielded by defensive rating. */
function combatPower(s: SkirmishSide): number {
  return (0.5 + s.strength) * Math.sqrt(Math.max(0, s.population)) * Math.max(0, s.defense);
}

/**
 * Deterministically resolve a skirmish between an attacker and a defender. Each
 * side's power rises with strength, numbers and defensive rating; the weaker side
 * suffers the larger share of casualties, but both sides always take some losses,
 * bounded by {@link RAID_BALANCE.maxLossFrac}. A pure function of its inputs — no
 * RNG — so outcomes are fully reproducible.
 */
export function resolveSkirmish(attacker: SkirmishSide, defender: SkirmishSide): SkirmishResult {
  const a = combatPower(attacker);
  const d = combatPower(defender);
  const total = a + d || 1; // avoid 0/0 if both sides are empty
  const m = RAID_BALANCE.maxLossFrac;
  return {
    attackerPower: a,
    defenderPower: d,
    // Each side's loss share scales with the *opponent's* power, so the stronger,
    // better-defended, more numerous side fares better.
    attackerLossFrac: m * (d / total),
    defenderLossFrac: m * (a / total),
  };
}

const RIVAL_NAMES = [
  "the Ashfolk",
  "the Rivermen",
  "the Stoneborn",
  "the Suncallers",
  "the Nightwalkers",
  "the Greenkin",
];

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;
const clamp01 = (v: number): number => clamp(v, 0, 1);
const lastEraIndex = ERAS.length - 1;

/**
 * Deterministically create the neighbour tribes for a run. Each is placed in a
 * distinct region the player did not start in; given the same RNG state and
 * start region this always yields the same tribes. `hostility` in [0,1] (the
 * Hostile Neighbours run mutator) seeds each tribe's starting relations downward,
 * so neighbours may begin hostile enough to raid.
 */
export function createRivals(rng: RNG, startRegion: string, hostility = 0): RivalTribe[] {
  const candidates = REGIONS.filter((r) => r.id !== startRegion);
  // Deterministic shuffle so home regions are spread, not always the first few.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const n = Math.min(RIVAL_BALANCE.count, candidates.length);
  const rivals: RivalTribe[] = [];
  for (let i = 0; i < n; i++) {
    const region = candidates[i];
    rivals.push({
      id: `rival-${region.id}`,
      name: RIVAL_NAMES[i % RIVAL_NAMES.length],
      homeRegion: region.id,
      biome: region.biome,
      population: rng.int(8, 18),
      strength: clamp01(rng.range(0.3, 0.55)),
      eraIndex: 0,
      techProgress: 0,
      disposition: clamp(rng.gauss(0, 0.2), -1, 1),
      relations: hostility ? clamp(-hostility, -1, 1) : 0,
    });
  }
  return rivals;
}

/**
 * Advance one rival tribe by a single tick using its own RNG. Population follows
 * logistic growth toward a strength/era-scaled capacity (with rare setbacks),
 * strength drifts toward an era-rising target, tech creeps forward (era never
 * regresses), and disposition mean-reverts around neutral. All values stay in
 * their documented bounds.
 */
export function evolveRival(r: RivalTribe, rng: RNG): void {
  const B = RIVAL_BALANCE;

  // Population: logistic growth toward capacity, with occasional setbacks.
  const capacity =
    B.capBase + r.strength * B.capPerStrength + r.eraIndex * B.capPerEra;
  r.population += r.population * B.growthRate * (1 - r.population / capacity);
  if (rng.chance(B.setbackChance)) {
    r.population *= 1 - B.setbackSeverity * rng.next();
  }
  if (r.population < B.popFloor) r.population = B.popFloor;

  // Strength: mean-revert toward a target that rises with their era, plus noise.
  const target = clamp01(B.strengthBase + r.eraIndex * B.strengthPerEra);
  r.strength = clamp01(
    r.strength + (target - r.strength) * B.strengthPull + rng.gauss(0, B.strengthNoise),
  );

  // Tech: bigger, stronger tribes advance faster; an era boundary carries over.
  if (r.eraIndex < lastEraIndex) {
    const popFactor = 0.5 + Math.min(r.population, B.techPopCap) / B.techPopCap;
    r.techProgress += B.techRate * (0.5 + r.strength) * popFactor;
    while (r.techProgress >= 1 && r.eraIndex < lastEraIndex) {
      r.techProgress -= 1;
      r.eraIndex++;
    }
    if (r.eraIndex >= lastEraIndex) r.techProgress = 0;
  }

  // Disposition: mean-reverting random walk toward neutral.
  r.disposition = clamp(
    r.disposition - r.disposition * B.dispositionPull + rng.gauss(0, B.dispositionNoise),
    -1,
    1,
  );
}

/**
 * Shift a rival's player-relations score by `delta`, clamped to [-1, 1]. The one
 * place relations ever changes, so the bound is guaranteed and the move is a pure
 * deterministic function of the current score and the delta.
 */
export function shiftRelations(r: RivalTribe, delta: number): void {
  r.relations = clamp(r.relations + delta, -1, 1);
}

/** The {@link Era} a rival currently sits in (their tech level). */
export function rivalEra(r: RivalTribe): Era {
  return ERAS[r.eraIndex];
}

/** Home region record for a rival, for the map view. */
export function rivalRegion(r: RivalTribe) {
  return regionById(r.homeRegion);
}
