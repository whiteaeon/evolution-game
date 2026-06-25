import { RNG } from "./rng.js";
import { clamp01, inherit, randomGenome } from "./genome.js";
import { individualName } from "./naming.js";
import { selectLeader, leaderBonus } from "./leadership.js";
import { pickDialogueLine, type DialogueSituation } from "./dialogue.js";
import { Knowledge, TECH_TREE, eraCapstone } from "./knowledge.js";
import { Culture } from "./culture.js";
import { Policies } from "./policies.js";
import {
  BIOME_PROFILE,
  DEFAULT_REGION,
  REGIONS,
  regionById,
  regionDistance,
  type BiomeProfile,
} from "./regions.js";
import {
  initQuests,
  evaluateQuests,
  type QuestContext,
  type QuestProgress,
} from "./quests.js";
import { createRivals, type RivalTribe } from "./rivals.js";
import { BALANCE, SHELTER_DEF, eraIndex } from "./balance.js";
import type { SimEngine } from "./engine.js";
import { updateWorld, seasonalConditions } from "./worldseason.js";
import { produce, pickResearchTarget } from "./production.js";
import { reproduce, carryingCapacity, fitnessWeights, pickByWeights } from "./reproduction.js";
import {
  maybeEvent,
  maybeEncounter,
  resolveEncounter as resolveEncounterImpl,
  maybeEventChain,
  maybeDiplomacy,
  resolveChoice as resolveChoiceImpl,
  accrueCulture,
} from "./events.js";
import { maybeRaid, evolveRivals } from "./raids.js";
import {
  ERAS,
  SHELTERS,
  TASKS,
  TRAITS,
  type Biome,
  type Encounter,
  type Era,
  type EventChainId,
  type PendingChoice,
  type Genome,
  type Individual,
  type Lineage,
  type ResourceCost,
  type ResourcePools,
  type Settlement,
  type Shelter,
  type SimConfig,
  type SimEvent,
  type SimEventType,
  type Task,
  type TaskAllocation,
  type TechEffects,
  type TechId,
  type TraitName,
  type WorldState,
} from "./types.js";

/**
 * Current save-format version. Bump when the serialized shape changes and add a
 * matching step in {@link migrateSave} so older saves keep loading.
 */
export const SAVE_VERSION = 2;

/** The raw object {@link Simulation.serialize} writes / {@link Simulation.load} reads. */
interface RawSave {
  /** Format version. Older saves used `v`; the very first ones had neither. */
  version?: number;
  v?: number;
  config?: Partial<SimConfig>;
  rng: number;
  rivalRng?: number;
  settlementRng?: number;
  epidemicRng?: number;
  nextId?: number;
  allocation?: TaskAllocation;
  // Migrated field-by-field, so older saves may be missing newer keys.
  state: Record<string, any>;
}

/**
 * Bring an older save up to {@link SAVE_VERSION}, filling any field a newer system
 * added with a sensible default so prior-version saves still load. Idempotent for
 * current saves (every field already present), so a round-trip stays byte-identical
 * and deterministic resume is preserved.
 */
function migrateSave(data: RawSave): RawSave {
  const from = data.version ?? data.v ?? 1;
  if (from < 2) upgradeToV2(data);
  data.version = SAVE_VERSION;
  return data;
}

/** v1 → v2: default the quest, rival, scouting, raw-resource and tally fields. */
function upgradeToV2(data: RawSave): void {
  const s = data.state;
  if (!s) return;
  // Raw gathered resources (wood/stone/hide) and the build/material pools were
  // added after the first saves; default any missing pool to empty.
  const fillPools = (r: Record<string, any> | undefined): void => {
    if (!r) return;
    r.materials ??= 0;
    r.buildProgress ??= 0;
    r.wood ??= 0;
    r.stone ??= 0;
    r.hide ??= 0;
  };
  fillPools(s.resources);
  if (Array.isArray(s.settlements)) for (const st of s.settlements) fillPools(st?.resources);
  // AI rival tribes, region fog-of-war and scouting.
  if (!Array.isArray(s.rivals)) s.rivals = [];
  if (!Array.isArray(s.discoveredRegions)) s.discoveredRegions = s.region ? [s.region] : [];
  if (typeof s.scouts !== "number") s.scouts = 0;
  if (typeof s.scoutProgress !== "number") s.scoutProgress = 0;
  // Objective quests.
  if (!Array.isArray(s.quests)) s.quests = initQuests();
  if (typeof s.goal !== "string") s.goal = "";
  // Lifetime tallies gained fields over time; default any that are missing.
  const t = (s.totals ??= {}) as Record<string, any>;
  t.births ??= 0;
  t.deaths ??= 0;
  t.interbred ??= 0;
  t.migrations ??= 0;
  t.peakPopulation ??= Array.isArray(s.individuals) ? s.individuals.length : 0;
  t.winterChainsSurvived ??= 0;
  t.lineagesInterbred ??= [];
  t.biomesVisited ??= s.biome ? [s.biome] : [];
  t.eventChainsSeen ??= [];
}

export const DEFAULT_CONFIG: SimConfig = {
  seed: 1,
  startingPopulation: 10,
  carryingCapacityBase: 16,
  mutationRate: 0.035,
  reproMinAge: 15,
  reproMaxAge: 45,
  maxAge: 62,
  eventInterval: 11,
  // The biome of the current region adds to this; the tundra homeland brings the
  // opening cold up to roughly the old ice-age baseline.
  baseCold: 0.28,
};

export interface SimState {
  tick: number;
  individuals: Individual[];
  resources: ResourcePools;
  knowledge: Knowledge;
  /** Cumulative belief track, parallel to the language chain (see {@link Culture}). */
  culture: Culture;
  /** Standing governing policies with trade-offs (see {@link Policies}). */
  policies: Policies;
  world: WorldState;
  shelter: Shelter;
  region: string;
  biome: Biome;
  era: Era;
  generation: number;
  /** Win: the tribe has become modern humans. */
  won: boolean;
  /**
   * The tribe's current leader (a living individual's id), or null before one is
   * chosen / when the tribe is empty. Their dominant trait grants a tribe-wide
   * bonus; on their death a succession picks the next (see {@link Simulation.leader}).
   */
  leaderId: number | null;
  cookingActive: boolean;
  log: SimEvent[];
  researchTarget: TechId | null;
  pendingEncounter: Encounter | null;
  pendingChoice: PendingChoice | null;
  /** Region fog-of-war: ids of regions the tribe has charted. The rest stay hidden. */
  discoveredRegions: string[];
  /** People sent to scout the map, drawn from the tribe's idle (unassigned) labour. */
  scouts: number;
  /** Exploration progress in [0,1) the scouting party has made toward the next region. */
  scoutProgress: number;
  /** AI neighbour tribes sharing the region map (pure sim; no diplomacy yet). */
  rivals: RivalTribe[];
  /**
   * The tribe's settlements. settlements[0] is the home camp (a live view whose
   * resources/members/allocation alias the top-level state); a second camp, once
   * founded via {@link Simulation.foundSettlement}, is a self-contained entry.
   */
  settlements: Settlement[];
  /** Lifetime tallies for the chronicle / stats / achievement screens. */
  totals: {
    births: number;
    deaths: number;
    interbred: number;
    /** Times the tribe has migrated to a new region this run. */
    migrations: number;
    /** Largest living population reached this run. */
    peakPopulation: number;
    /** Hard-winter event chains the tribe has resolved (survived). */
    winterChainsSurvived: number;
    /** Distinct hominin lineages the tribe has interbred with. */
    lineagesInterbred: Lineage[];
    /** Distinct biomes the tribe has ever lived in (for the codex). */
    biomesVisited: Biome[];
    /** Distinct choice-driven event chains the tribe has encountered (for the codex). */
    eventChainsSeen: EventChainId[];
  };
  /** A short, human-readable description of the next objective. */
  goal: string;
  /** Objective-driven quests with live progress, completion and rewards. */
  quests: QuestProgress[];
}

export interface TraitAverages {
  count: number;
  traits: Record<TraitName, number>;
}

export class Simulation {
  readonly config: SimConfig;
  private rng: RNG;
  /**
   * Separate RNG stream for the AI neighbour tribes. Keeping rivals off the main
   * stream means their evolution never perturbs the player's simulation, balance
   * or replay — yet it is still saved/restored, so rivals resume deterministically.
   */
  private rivalRng: RNG;
  /**
   * Separate RNG stream for founded (secondary) settlements, mirroring rivalRng's
   * isolation: a second camp's births and deaths never perturb the home tribe's
   * stream, balance or replay, yet it is saved/restored so it resumes identically.
   */
  private settlementRng: RNG;
  /**
   * Separate RNG stream for epidemics, mirroring rivalRng/settlementRng: keeping
   * outbreak rolls off the main stream means adding epidemics never perturbs the
   * existing replay alignment, yet it is saved/restored so outbreaks resume
   * deterministically.
   */
  private epidemicRng: RNG;
  private nextId = 1;
  state: SimState;
  allocation: TaskAllocation;

  constructor(config: Partial<SimConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rng = new RNG(this.config.seed);
    this.rivalRng = new RNG((this.config.seed ^ 0x5f3759df) >>> 0);
    this.settlementRng = new RNG((this.config.seed ^ 0x85ebca6b) >>> 0);
    this.epidemicRng = new RNG((this.config.seed ^ 0xc2b2ae35) >>> 0);
    this.allocation = Object.fromEntries(TASKS.map((t) => [t, 0])) as TaskAllocation;
    this.state = this.createInitialState();
  }

  /**
   * This instance narrowed to the surface the extracted concern modules touch
   * (see {@link SimEngine}). Lets the production/reproduction/events/raids logic
   * live in focused files without loosening the class's own `private` modifiers.
   */
  private get eng(): SimEngine {
    return this as unknown as SimEngine;
  }

  // ── setup ────────────────────────────────────────────────────────────────

  private createInitialState(): SimState {
    const individuals: Individual[] = [];
    for (let i = 0; i < this.config.startingPopulation; i++) {
      individuals.push(this.makeIndividual(this.founderGenome(), 0, this.rng.int(14, 28)));
    }
    const knowledge = new Knowledge();
    const region = regionById(this.config.startRegion ?? DEFAULT_REGION);
    const resources: ResourcePools = { food: this.config.startingFood ?? 20, materials: 0, buildProgress: 0, wood: 0, stone: 0, hide: 0 };
    // The home settlement is a live view: its resources/members/allocation are the
    // SAME references as the top-level state, so the existing tick path drives it
    // unchanged. region/biome/shelter mirror the top-level fields (kept in sync at
    // their write sites: migrate + tryUpgradeShelter).
    const home: Settlement = {
      id: "home",
      name: region.name,
      region: region.id,
      biome: region.biome,
      shelter: "cave",
      resources,
      members: individuals,
      allocation: this.allocation,
    };
    return {
      tick: 0,
      individuals,
      resources,
      knowledge,
      culture: new Culture(),
      policies: new Policies(),
      world: { cold: this.config.baseCold, abundance: 1, season: 0, seasonIndex: 0 },
      shelter: "cave",
      region: region.id,
      biome: region.biome,
      era: "Paleolithic",
      generation: 0,
      won: false,
      leaderId: null,
      cookingActive: false,
      log: [],
      researchTarget: knowledge.available()[0] ?? null,
      pendingEncounter: null,
      pendingChoice: null,
      discoveredRegions: [region.id],
      scouts: 0,
      scoutProgress: 0,
      rivals: createRivals(this.rivalRng, region.id, this.config.rivalHostility ?? 0),
      settlements: [home],
      totals: {
        births: 0,
        deaths: 0,
        interbred: 0,
        migrations: 0,
        peakPopulation: individuals.length,
        winterChainsSurvived: 0,
        lineagesInterbred: [],
        biomesVisited: [region.biome],
        eventChainsSeen: [],
      },
      goal: "",
      quests: initQuests(),
    };
  }

  private founderGenome(): Genome {
    const g = randomGenome(this.rng);
    const bonus = this.config.founderBonus;
    if (bonus) for (const t of TRAITS) g[t] = clamp01(g[t] + (bonus[t] ?? 0));
    return g;
  }

  private makeIndividual(
    genome: Genome,
    generation: number,
    age: number,
    motherId?: number,
    fatherId?: number,
    rng: RNG = this.rng,
  ): Individual {
    return {
      id: this.nextId++,
      genome,
      sex: rng.chance(0.5) ? "f" : "m",
      age,
      generation,
      motherId,
      fatherId,
      food: 0.7,
      warmth: 0.7,
      health: 0.8,
      alive: true,
      ateCooked: false,
    };
  }

  // ── player API ─────────────────────────────────────────────────────────────

  setAllocation(task: Task, count: number): void {
    this.allocation[task] = Math.max(0, Math.floor(count));
  }

  setResearchTarget(tech: TechId | null): void {
    this.state.researchTarget = tech;
  }

  /**
   * Player-directed research: pour `points` of insight into the current research
   * target, mirroring the in-sim research loop (and the event-driven insight
   * gift) so a chieftain who funds study completes a tech exactly as the
   * autopiloted tribe would — resource-gated techs still need their bill in hand.
   * Returns the TechId completed by this push (else null). Because this is driven
   * from the interactive scene (where the sim is paused), it folds the era/win
   * step in line so a capstone discovered this way advances the world at once.
   */
  fundResearch(points: number): TechId | null {
    const s = this.state;
    if (
      !s.researchTarget ||
      s.knowledge.has(s.researchTarget) ||
      !s.knowledge.isUnlocked(s.researchTarget)
    ) {
      s.researchTarget = pickResearchTarget(s);
    }
    if (!s.researchTarget) return null;
    const req = TECH_TREE[s.researchTarget].resourceCost;
    const ready = !req || this.hasResources(req);
    const completed = s.knowledge.addProgress(s.researchTarget, points, ready);
    if (completed) {
      if (req) this.spendResources(req);
      const def = TECH_TREE[completed];
      const kind: SimEventType = def.unlocksEra ? "milestone" : "discovery";
      this.logEvent(kind, def.unlocksEra ? `${def.name} — the ${def.unlocksEra} begins!` : `Discovered ${def.name}.`);
      s.researchTarget = pickResearchTarget(s);
      s.era = s.knowledge.currentEra();
      if (s.era === "Information" && !s.won) {
        s.won = true;
        this.logEvent("milestone", "The Information Age dawns — your people reshape the world. The journey is complete.");
      }
    }
    return completed;
  }

  /** Adopt a standing policy stance on a governing axis (see {@link Policies}). */
  setPolicy(axisId: string, stanceId: string): void {
    this.state.policies.set(axisId, stanceId);
  }

  /** Dedicate up to `count` of the tribe's idle labour to scouting the map. */
  setScouts(count: number): void {
    this.state.scouts = Math.max(0, Math.floor(count));
  }

  /** What it would cost to migrate to a region right now (for the UI). */
  migrationCost(regionId: string): { distance: number; food: number; risk: number } {
    const dist = regionDistance(this.state.region, regionId);
    const pop = this.living.length;
    return {
      distance: dist,
      food: Math.ceil(pop * dist * BALANCE.migrateFoodPerHead),
      risk: dist * BALANCE.migrateRisk,
    };
  }

  /**
   * Migrate the whole tribe to another region. A real decision: it eats food and
   * the journey kills some — the frail and weak especially — but it changes the
   * environment (and its selection pressures) entirely. Returns the death toll.
   */
  migrate(regionId: string): number {
    const s = this.state;
    if (regionId === s.region) return 0;
    const target = regionById(regionId);
    const { distance, food } = this.migrationCost(regionId);
    const underfed = s.resources.food < food;
    s.resources.food = Math.max(0, s.resources.food - food);

    let deaths = 0;
    for (const ind of this.living) {
      const hardiness = 0.4 * ind.genome.strength + 0.3 * ind.genome.coldTolerance + 0.3 * ind.health;
      let p = distance * BALANCE.migrateRisk * (1 - 0.6 * hardiness);
      if (underfed) p *= 1.6;
      if (this.rng.chance(clamp01(p))) {
        ind.alive = false;
        s.totals.deaths++;
        deaths++;
        this.invalidateLiving();
      }
    }
    s.region = target.id;
    s.biome = target.biome;
    s.settlements[0].region = target.id;
    s.settlements[0].biome = target.biome;
    s.totals.migrations++;
    if (!s.totals.biomesVisited.includes(target.biome)) s.totals.biomesVisited.push(target.biome);
    this.logEvent("milestone", `The tribe migrates to ${target.name} (${target.biome})${deaths ? ` — ${deaths} lost on the journey` : ""}.`);
    return deaths;
  }

  /**
   * Found a second settlement in a discovered region, splitting off `migrants`
   * able adults from the home camp. The new camp keeps its own shelter, resources,
   * members and task allocation and is subject to its own local biome pressures,
   * while the tribe's knowledge/culture stays shared. The scope is exactly two
   * settlements: this is a no-op (returns null) once a second one exists, if the
   * region is not yet charted, or if the home camp cannot spare the people.
   * Draws nothing from the home RNG stream, so it never perturbs the home replay.
   */
  foundSettlement(regionId: string, migrants: number): Settlement | null {
    const s = this.state;
    if (s.settlements.length >= 2) return null; // exactly two settlements
    if (!s.discoveredRegions.includes(regionId)) return null;
    const n = Math.floor(migrants);
    if (n < 1) return null;
    // Pick able adults deterministically (lowest ids first) — no RNG draw.
    const eligible = this.living
      .filter((i) => i.age >= this.config.reproMinAge - 4 && i.health > 0.15)
      .sort((a, b) => a.id - b.id);
    if (eligible.length - n < 2) return null; // leave at least two able adults home
    const chosen = eligible.slice(0, n);
    const region = regionById(regionId);

    // The migrants carry provisions; the rest of their pool stays at home.
    const stake = Math.min(s.resources.food, n * BALANCE.foundFoodPerHead);
    s.resources.food -= stake;

    // Remove the migrants from the home pool so the home tick stops processing
    // them, then re-alias the home settlement's view and rebuild the living cache.
    const leaving = new Set(chosen.map((c) => c.id));
    s.individuals = s.individuals.filter((i) => !leaving.has(i.id));
    s.settlements[0].members = s.individuals;
    this.resetLivingCache();

    const st: Settlement = {
      id: `settlement-${s.settlements.length + 1}`,
      name: region.name,
      region: region.id,
      biome: region.biome,
      shelter: "cave",
      resources: { food: stake, materials: 0, buildProgress: 0, wood: 0, stone: 0, hide: 0 },
      members: chosen,
      allocation: { ...this.allocation },
    };
    s.settlements.push(st);
    if (!s.totals.biomesVisited.includes(region.biome)) s.totals.biomesVisited.push(region.biome);
    this.logEvent("milestone", `A party of ${n} leaves to found ${st.name} (${region.biome}).`);
    return st;
  }

  /** Set how many members of a settlement (by array index) do a given task. */
  setSettlementAllocation(index: number, task: Task, count: number): void {
    const st = this.state.settlements[index];
    if (!st) return;
    st.allocation[task] = Math.max(0, Math.floor(count));
  }

  autoAllocate(weights: Partial<Record<Task, number>>): void {
    const adults = this.living.filter(
      (i) => i.age >= this.config.reproMinAge - 4 && i.health > 0.15,
    ).length;
    let totalW = 0;
    for (const t of TASKS) totalW += weights[t] ?? 0;
    if (totalW <= 0) return;
    for (const t of TASKS) {
      this.allocation[t] = Math.round((adults * (weights[t] ?? 0)) / totalW);
    }
  }

  /**
   * Incrementally-maintained snapshot of the living individuals. The full
   * individuals array grows with every birth and retains the dead forever, and
   * it is read many times per tick, so rebuilding the filtered list by scanning
   * the whole (ever-growing) array was the dominant late-game cost. Instead we
   * keep one living array and patch it in place: newly appended individuals are
   * absorbed from the tail (births/interbreeding only ever append), and a death
   * flag triggers an O(living) compaction — never an O(total-retained) rescan.
   * Behaviour is identical to the old per-call filter: the returned array holds
   * exactly the alive individuals in insertion order, and callers never mutate
   * it in place.
   */
  private livingCache: Individual[] = [];
  private livingSeen = 0;
  private livingHasDead = false;

  private invalidateLiving(): void {
    this.livingHasDead = true;
  }

  /**
   * Force a full rebuild of the living cache. Used when state.individuals is
   * replaced wholesale (e.g. founding a settlement removes departing members),
   * which the incremental tail-scan cannot track.
   */
  private resetLivingCache(): void {
    this.livingCache = [];
    this.livingSeen = 0;
    this.livingHasDead = false;
  }

  get living(): Individual[] {
    const all = this.state.individuals;
    if (this.livingSeen < all.length) {
      for (let i = this.livingSeen; i < all.length; i++) {
        if (all[i].alive) this.livingCache.push(all[i]);
      }
      this.livingSeen = all.length;
    }
    if (this.livingHasDead) {
      this.livingCache = this.livingCache.filter((i) => i.alive);
      this.livingHasDead = false;
    }
    return this.livingCache;
  }

  /** Look up any individual (living or dead) by id — for the family tree. */
  individualById(id: number): Individual | undefined {
    const home = this.state.individuals.find((i) => i.id === id);
    if (home) return home;
    // settlements[0] aliases state.individuals (searched above); scan the rest.
    for (let i = 1; i < this.state.settlements.length; i++) {
      const m = this.state.settlements[i].members.find((x) => x.id === id);
      if (m) return m;
    }
    return undefined;
  }

  traitAverages(): TraitAverages {
    const living = this.living;
    const traits = {} as Record<TraitName, number>;
    for (const t of TRAITS) {
      let sum = 0;
      for (const ind of living) sum += ind.genome[t];
      traits[t] = living.length ? sum / living.length : 0;
    }
    return { count: living.length, traits };
  }

  // ── leadership ───────────────────────────────────────────────────────────────

  /** The tribe's current leader, if one is alive — for the chronicle/UI. */
  leader(): Individual | undefined {
    const id = this.state.leaderId;
    return id != null ? this.living.find((i) => i.id === id) : undefined;
  }

  /** Living adults eligible to lead (same threshold used for work + founding). */
  private eligibleLeaders(): Individual[] {
    return this.living.filter((i) => i.age >= this.config.reproMinAge - 4 && i.health > 0.15);
  }

  /**
   * Keep the standing leader while they live; on their death (or at the first tick
   * with eligible adults) a succession picks the next — the most capable living
   * adult. Logged as a milestone so it surfaces in the existing chronicle.
   */
  private updateLeader(): void {
    const s = this.state;
    if (s.leaderId != null && this.living.some((i) => i.id === s.leaderId)) return;
    const heir = selectLeader(this.eligibleLeaders());
    const hadLeader = s.leaderId != null;
    s.leaderId = heir; // a living eligible adult, or null when none can lead
    if (heir == null) return;
    const lead = this.individualById(heir)!;
    const verb = hadLeader ? "succeeds to lead" : "rises to lead";
    this.logEvent("milestone", `${individualName(lead)} ${leaderBonus(lead).style} ${verb} the tribe.`);
  }

  /** Fold the standing leader's trait-driven bonus into this tick's tech effects. */
  private applyLeaderBonus(e: Required<TechEffects>): void {
    const leader = this.leader();
    if (!leader) return;
    const b = leaderBonus(leader);
    e.defenseMult *= b.defenseMult;
    e.researchMult *= b.researchMult;
    e.foodMult *= b.foodMult;
  }

  // ── main loop ──────────────────────────────────────────────────────────────

  tick(): void {
    const s = this.state;
    s.tick++;

    const effects = s.knowledge.aggregateEffects();
    s.culture.foldInto(effects); // belief cohesion, aggregated into the same bundle
    s.policies.foldInto(effects); // standing policy trade-offs, same bundle
    this.applyLeaderBonus(effects);
    updateWorld(this.state, this.config, effects);
    this.distributeWorkers();
    produce(this.eng, effects);
    accrueCulture(this.eng);
    this.advanceScouting();
    this.consumeAndUpdateNeeds(effects);
    const popBeforeDeaths = this.living.length;
    this.ageAndDie(effects);
    maybeEvent(this.eng, effects);
    this.maybeEpidemic(effects);
    maybeRaid(this.eng, effects);
    // A notable loss: several of the tribe fell in a single year — they grieve.
    if (popBeforeDeaths - this.living.length >= 2) this.emitDialogue("death");
    maybeEncounter(this.eng);
    maybeEventChain(this.eng);
    maybeDiplomacy(this.eng);
    reproduce(this.eng, effects);
    this.tryUpgradeShelter();
    evolveRivals(this.state, this.rivalRng);
    // Refresh the leader after all of this tick's deaths are resolved, so the role
    // always points at a living adult (or null); the bonus above used the standing
    // leader and a succession (if any) is logged here.
    this.updateLeader();
    this.updateEraAndGeneration();
    s.totals.peakPopulation = Math.max(s.totals.peakPopulation, this.living.length);
    this.evaluateQuests();

    // Soft storage cap: surplus food can't grow unbounded — it's bounded by the
    // tribe's carrying capacity (shelter tier / biome / tech), keeping mid/late
    // game tension. Clamped after every tick so observers always see it bounded.
    s.resources.food = Math.min(s.resources.food, this.foodStorageCap(effects));

    // Founded settlements run their own lifecycle last, after (and isolated from)
    // the home tribe — on a separate RNG stream — so they never perturb the home
    // simulation, balance or replay. A run that never founds one is byte-identical.
    this.tickSecondarySettlements(effects);
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.tick();
  }

  private biome(): BiomeProfile {
    return BIOME_PROFILE[this.state.biome];
  }

  private workers: Record<Task, Individual[]> = {} as Record<Task, Individual[]>;

  private distributeWorkers(): void {
    const adults = this.living.filter(
      (i) => i.age >= this.config.reproMinAge - 4 && i.health > 0.15,
    );
    // `living` is in insertion order and individuals are only ever appended with a
    // strictly increasing id, so this filtered list is already sorted by id — no
    // per-tick copy + sort needed. (Invariant guarded by simulation.test.ts.)
    const pool = adults;
    const out = Object.fromEntries(TASKS.map((t) => [t, [] as Individual[]])) as Record<
      Task,
      Individual[]
    >;
    let idx = 0;
    for (const task of TASKS) {
      if (task === "idle") continue;
      const want = this.allocation[task];
      for (let n = 0; n < want && idx < pool.length; n++) out[task].push(pool[idx++]);
    }
    while (idx < pool.length) out.idle.push(pool[idx++]);
    this.workers = out;
  }

  /**
   * Scouting: idle hands chart the fogged regions of the map. Progress toward the
   * nearest undiscovered region accrues with the number of scouts (capped at the
   * tribe's spare labour). When a region is charted it surfaces an outcome — a raw
   * resource cache or a small foraging find. With no scouts (or nothing left to
   * find) this is a no-op that never touches the RNG, so it cannot perturb any
   * existing run, replay or balance.
   */
  private advanceScouting(): void {
    const s = this.state;
    const target = this.nearestUndiscoveredRegion();
    if (!target) return; // the whole map is already charted
    const scouts = Math.min(s.scouts, this.workers.idle.length);
    if (scouts <= 0) return;
    s.scoutProgress += scouts * BALANCE.scoutBase;
    if (s.scoutProgress >= 1) {
      s.scoutProgress = 0;
      this.revealRegion(target);
    }
  }

  /** The closest region the tribe has not yet charted, or null once all are known. */
  private nearestUndiscoveredRegion(): string | null {
    const s = this.state;
    let best: string | null = null;
    let bestDist = Infinity;
    for (const r of REGIONS) {
      if (s.discoveredRegions.includes(r.id)) continue;
      const d = regionDistance(s.region, r.id);
      if (d < bestDist) {
        bestDist = d;
        best = r.id;
      }
    }
    return best;
  }

  /** Chart a region and surface its outcome: a raw-resource cache or a foraging find. */
  private revealRegion(id: string): void {
    const s = this.state;
    s.discoveredRegions.push(id);
    const region = regionById(id);
    if (this.rng.chance(BALANCE.scoutCacheChance)) {
      // A cache: raw goods the scouts haul back, flavoured by the region's biome.
      const prof = BIOME_PROFILE[region.biome];
      const wood = Math.round(BALANCE.scoutCacheAmount * prof.wood);
      const stone = Math.round(BALANCE.scoutCacheAmount * prof.stone);
      const hide = Math.round(BALANCE.scoutCacheAmount * prof.hide);
      s.resources.wood += wood;
      s.resources.stone += stone;
      s.resources.hide += hide;
      this.logEvent(
        "discovery",
        `Scouts chart ${region.name} (${region.biome}) and haul back a cache: +${wood} wood, +${stone} stone, +${hide} hide.`,
      );
    } else {
      // A small event: no cache, but the foraging party returns with food.
      const food = Math.round(BALANCE.scoutEventFood * s.world.abundance);
      s.resources.food += food;
      this.logEvent(
        "discovery",
        `Scouts chart ${region.name} (${region.biome}); a foraging party returns with +${food} food.`,
      );
    }
  }

  private consumeAndUpdateNeeds(e: Required<TechEffects>): void {
    const s = this.state;
    const living = this.living;
    const perCapita =
      BALANCE.consumptionPerCapita * (s.cookingActive ? BALANCE.cookedConsumptionFactor : 1);
    const need = living.length * perCapita;
    const shortage = s.resources.food < need;
    s.resources.food = Math.max(0, s.resources.food - need);

    const warmth = SHELTER_DEF[s.shelter].warmth + e.warmth;

    for (const ind of living) {
      ind.food = shortage ? clamp01(ind.food - 0.35) : clamp01(ind.food + 0.3);
      ind.ateCooked = s.cookingActive && !shortage;
      const exposure = clamp01(s.world.cold - ind.genome.coldTolerance - warmth);
      ind.warmth = clamp01(1 - exposure - (shortage ? 0.1 : 0));
      const target = (ind.food + ind.warmth) / 2;
      ind.health = clamp01(ind.health * 0.6 + target * 0.4);
    }
  }

  private ageAndDie(e: Required<TechEffects>): void {
    const s = this.state;
    for (const ind of this.living) {
      ind.age++;
      if (this.rng.chance(this.mortalityProb(ind, e, s.shelter, this.biome(), s.world.cold))) {
        ind.alive = false;
        s.totals.deaths++;
        this.invalidateLiving();
      }
    }
  }

  /**
   * Per-individual death probability under a given shelter / biome / ambient cold.
   * Parameterised so both the home tribe and any founded settlement run the exact
   * same mortality model against their own local conditions (biome pressures).
   */
  private mortalityProb(
    ind: Individual,
    e: Required<TechEffects>,
    shelter: Shelter,
    b: BiomeProfile,
    cold: number,
  ): number {
    let p = 0;
    if (ind.age > this.config.reproMaxAge) {
      p += 0.02 + Math.pow(
        (ind.age - this.config.reproMaxAge) / (this.config.maxAge - this.config.reproMaxAge), 2,
      ) * 0.5;
    }
    const warmth = SHELTER_DEF[shelter].warmth + e.warmth;
    const exposure = clamp01(cold - ind.genome.coldTolerance - warmth);
    p += exposure * BALANCE.coldLethality;
    if (ind.food <= 0.05) p += BALANCE.starveLethality;
    // Endemic disease, scaled by the biome and attenuated by medicine/sanitation.
    p += (1 - ind.genome.diseaseResistance) * BALANCE.chronicDisease * b.diseaseMult * (1 - e.diseaseDefense) * (this.config.diseaseLethality ?? 1);
    p += (1 - ind.health) * 0.04;
    return clamp01(p);
  }

  /**
   * Bounded severity of an epidemic right now: the per-fully-susceptible death
   * probability before each individual's diseaseResistance is applied. Scales up
   * with crowding (population / carrying capacity), the biome's diseaseMult and
   * the era (denser, more-connected settlements spread disease faster), and is
   * attenuated by medicine/sanitation/vaccines via {@link TechEffects.diseaseDefense}.
   * Clamped to [0, epidemicMaxSeverity] so a single outbreak can never be a
   * guaranteed wipe — keeping the game winnable. Pure query: no RNG, no mutation.
   */
  epidemicSeverity(e: Required<TechEffects>): number {
    const capacity = Math.max(1, this.carryingCapacity(e));
    const density = clamp01(this.living.length / capacity);
    const densityTerm = BALANCE.epidemicDensityFloor + density * BALANCE.epidemicDensityScale;
    const eraTerm = 1 + eraIndex(this.state.era) * BALANCE.epidemicEraScale;
    const mitigation = clamp01(1 - e.diseaseDefense);
    const raw =
      BALANCE.epidemicBaseSeverity *
      densityTerm *
      this.biome().diseaseMult *
      eraTerm *
      mitigation *
      (this.config.diseaseLethality ?? 1);
    return Math.min(BALANCE.epidemicMaxSeverity, raw);
  }

  /**
   * Apply one epidemic at the current scaled severity, returning the death count.
   * Survival is weighted hard toward diseaseResistance — susceptibility is
   * `(1 - resistance)^epidemicSelectionExponent` with the exponent > 1, so the
   * frail die disproportionately and outbreaks select for resistance more sharply
   * than endemic disease. Public so the severity → mortality pipeline can be
   * exercised deterministically in tests; the gating lives in {@link maybeEpidemic}.
   */
  triggerEpidemic(e: Required<TechEffects> = this.state.knowledge.aggregateEffects()): number {
    const severity = this.epidemicSeverity(e);
    if (severity <= 0) return 0;
    const s = this.state;
    let deaths = 0;
    for (const ind of this.living) {
      const susceptibility = Math.pow(
        1 - ind.genome.diseaseResistance,
        BALANCE.epidemicSelectionExponent,
      );
      if (this.epidemicRng.chance(clamp01(severity * susceptibility))) {
        ind.alive = false;
        s.totals.deaths++;
        this.invalidateLiving();
        deaths++;
      }
    }
    return deaths;
  }

  /**
   * Occasionally unleash an epidemic on the home tribe. Fires on its own interval
   * and roll drawn from {@link epidemicRng}, so adding it leaves the main stream's
   * replay alignment untouched. Never fires below {@link BALANCE.epidemicMinPop} so
   * a small, recovering tribe is not doomed.
   */
  private maybeEpidemic(e: Required<TechEffects>): void {
    const s = this.state;
    if (s.tick % BALANCE.epidemicInterval !== 0) return;
    if (this.living.length < BALANCE.epidemicMinPop) return;
    if (!this.epidemicRng.chance(BALANCE.epidemicChance)) return;
    const before = this.living.length;
    const deaths = this.triggerEpidemic(e);
    this.logEvent(
      "disease",
      deaths > 0
        ? `An epidemic sweeps the crowded camp — ${deaths} lost.`
        : "An epidemic passes through, but the tribe holds.",
    );
    if (before - this.living.length >= 2) this.emitDialogue("death");
  }

  /** Resolve a pending encounter. Accepting injects new, archetype-leaning kin. */
  resolveEncounter(accept: boolean): void {
    resolveEncounterImpl(this.eng, accept);
  }

  /**
   * Resolve a pending choice. Option 0 is the cautious branch (a sure cost),
   * option 1 the risky branch (a bigger payoff at the cost of lives).
   */
  resolveChoice(option: number): void {
    resolveChoiceImpl(this.eng, option);
  }

  carryingCapacity(
    e: Required<TechEffects>,
    shelter: Shelter = this.state.shelter,
    b: BiomeProfile = this.biome(),
  ): number {
    return carryingCapacity(this.config, e, shelter, b);
  }

  /** Soft upper bound on stored food, scaled by the tribe's carrying capacity. */
  foodStorageCap(e: Required<TechEffects>): number {
    return this.carryingCapacity(e) * BALANCE.foodStoragePerCapacity;
  }

  private tryUpgradeShelter(): void {
    const s = this.state;
    const idx = SHELTERS.indexOf(s.shelter);
    if (idx >= SHELTERS.length - 1) return;
    const next = SHELTERS[idx + 1];
    const def = SHELTER_DEF[next];
    if (eraIndex(s.era) < eraIndex(def.minEra)) return; // era-gated
    if (s.resources.buildProgress < def.buildCost) return; // labor gate
    if (!this.hasResources(def.cost)) return; // raw-material gate
    s.resources.buildProgress -= def.buildCost;
    this.spendResources(def.cost);
    s.shelter = next;
    s.settlements[0].shelter = next;
    this.logEvent("milestone", `The tribe builds a ${next}.`);
  }

  /** Whether the tribe currently holds at least the resources in `req`. */
  private hasResources(req: ResourceCost): boolean {
    return this.hasResourcesIn(this.state.resources, req);
  }

  /** Deduct a resource bill from the home pools (assumes {@link hasResources}). */
  private spendResources(req: ResourceCost): void {
    this.spendResourcesIn(this.state.resources, req);
  }

  /** Whether the given pool holds at least the resources in `req`. */
  private hasResourcesIn(r: ResourcePools, req: ResourceCost): boolean {
    return (req.wood ?? 0) <= r.wood && (req.stone ?? 0) <= r.stone && (req.hide ?? 0) <= r.hide;
  }

  /** Deduct a resource bill from the given pool (assumes {@link hasResourcesIn}). */
  private spendResourcesIn(r: ResourcePools, req: ResourceCost): void {
    if (req.wood) r.wood -= req.wood;
    if (req.stone) r.stone -= req.stone;
    if (req.hide) r.hide -= req.hide;
  }

  private updateEraAndGeneration(): void {
    const s = this.state;
    const era = s.knowledge.currentEra();
    if (era !== s.era && !s.won) {
      // The capstone discovery already logs the era change; the tribe reacts.
      this.emitDialogue("eraChange");
    }
    s.era = era;
    if (era === "Information" && !s.won) {
      s.won = true;
      this.logEvent("milestone", "The Information Age dawns — your people reshape the world. The journey is complete.");
    }

    let maxGen = 0;
    for (const ind of this.living) if (ind.generation > maxGen) maxGen = ind.generation;
    // A notable birth: the first of a new generation has come of age.
    if (maxGen > s.generation) this.emitDialogue("birth");
    s.generation = maxGen;

    s.goal = this.computeGoal();
  }

  /** Next-objective hint: the upcoming era capstone and what it still needs. */
  private computeGoal(): string {
    const s = this.state;
    if (s.won) return "You have reached the Information Age — you win!";
    const nextEra = ERAS[eraIndex(s.era) + 1];
    const capstone = nextEra ? eraCapstone(nextEra) : null;
    if (!capstone) return "Advance your knowledge.";
    const def = TECH_TREE[capstone];
    if (s.knowledge.has(capstone)) return `Toward the ${nextEra}…`;
    const missing = def.prereqs.filter((p) => !s.knowledge.has(p));
    if (missing.length === 0) return `Research ${def.name} to enter the ${nextEra}.`;
    return `For the ${nextEra}: research ${missing.map((m) => TECH_TREE[m].name).join(", ")} → ${def.name}.`;
  }

  /**
   * Advance the quest log against the current state and grant the reward for any
   * quest completed this tick. The context is derived purely from sim state, so
   * quests stay a read-only layer over the simulation.
   */
  private evaluateQuests(): void {
    const s = this.state;
    const startBiome = regionById(this.config.startRegion ?? DEFAULT_REGION).biome;
    const settled = SHELTERS.indexOf(s.shelter) >= SHELTERS.indexOf("village");
    const ctx: QuestContext = {
      tick: s.tick,
      population: this.living.length,
      hasFire: s.knowledge.has("fire"),
      lineageCount: s.totals.lineagesInterbred.length,
      winterChainsSurvived: s.totals.winterChainsSurvived,
      settlementInNewBiome: settled && s.biome !== startBiome,
    };
    const completed = evaluateQuests(s.quests, ctx);
    for (const def of completed) {
      if (def.reward.food) s.resources.food += def.reward.food;
      if (def.reward.materials) s.resources.materials += def.reward.materials;
      this.logEvent("milestone", `Quest complete — ${def.title}: ${def.description}`);
    }
  }

  protected logEvent(type: SimEventType, message: string): void {
    this.state.log.push({ type, tick: this.state.tick, message });
    if (this.state.log.length > 60) this.state.log.shift();
  }

  /**
   * Surface one flavor line for a situation into the log — the tribe's voice. The
   * pick is seeded by the current tick (not the sim RNG), so it is deterministic
   * and replayable yet never perturbs the simulation's random stream or balance.
   */
  private emitDialogue(situation: DialogueSituation): void {
    this.logEvent("dialogue", `“${pickDialogueLine(situation, this.state.tick)}”`);
  }

  // ── secondary settlements ──────────────────────────────────────────────────

  /** Run every founded (non-home) settlement one tick, isolated from the home. */
  private tickSecondarySettlements(e: Required<TechEffects>): void {
    const settlements = this.state.settlements;
    for (let i = 1; i < settlements.length; i++) this.tickSettlement(settlements[i], e);
  }

  /**
   * One settlement's lifecycle for a tick: production, consumption + needs,
   * local-biome mortality, reproduction and shelter upgrades. Production shares the
   * tribe's tech effects and feeds the shared knowledge tree, but everything else
   * (resources, members, shelter, biome pressures) is the settlement's own. All
   * stochastic steps draw on {@link settlementRng}, never the home stream.
   */
  private tickSettlement(st: Settlement, e: Required<TechEffects>): void {
    const s = this.state;
    const k = s.knowledge;
    const b = BIOME_PROFILE[st.biome];
    // Local biome conditions: same season as home, but this settlement's biome —
    // shares updateWorld's seasonal formula so cold/abundance pressures are truly local.
    const { cold, abundance } = seasonalConditions(this.config, b, s.world.season, e);

    const alive = st.members.filter((m) => m.alive);
    const workers = this.distributeForSettlement(alive, st.allocation);

    // ── produce ──
    let food = 0;
    let hide = 0;
    for (const w of workers.gather) {
      const techMult = k.has("gathering") ? 1 : 0.95;
      food += BALANCE.gatherBase * (0.5 + w.genome.dexterity) * e.gatherMult * b.gatherMult * techMult * abundance;
    }
    for (const w of workers.hunt) {
      const techMult = k.has("hunting") ? 1 : 0.6;
      food += BALANCE.huntBase * (0.5 + w.genome.strength) * e.huntMult * b.huntMult * techMult * abundance;
      hide += BALANCE.hidePerHunter * (0.5 + w.genome.strength) * e.huntMult * b.hide;
    }
    food *= e.foodMult;
    st.resources.food += food;
    st.resources.hide += hide;

    const cookingActive = k.has("cooking") && workers.cook.length > 0 && st.resources.food > 0;

    let build = 0;
    let wood = 0;
    let stone = 0;
    for (const w of workers.build) {
      const eff = 0.5 + w.genome.strength * 0.5 + w.genome.dexterity * 0.5;
      build += BALANCE.buildBase * eff * e.buildMult;
      wood += BALANCE.woodPerBuilder * eff * e.buildMult * b.wood;
      stone += BALANCE.stonePerBuilder * eff * e.buildMult * b.stone;
    }
    st.resources.buildProgress += build;
    st.resources.materials += build * BALANCE.materialsPerBuild;
    st.resources.wood += wood;
    st.resources.stone += stone;

    // Research feeds the shared knowledge tree — culture is tribe-wide.
    this.settlementResearch(workers.research, e);

    // ── consume + needs ──
    const perCapita =
      BALANCE.consumptionPerCapita * (cookingActive ? BALANCE.cookedConsumptionFactor : 1);
    const need = alive.length * perCapita;
    const shortage = st.resources.food < need;
    st.resources.food = Math.max(0, st.resources.food - need);
    const warmth = SHELTER_DEF[st.shelter].warmth + e.warmth;
    for (const ind of alive) {
      ind.food = shortage ? clamp01(ind.food - 0.35) : clamp01(ind.food + 0.3);
      ind.ateCooked = cookingActive && !shortage;
      const exposure = clamp01(cold - ind.genome.coldTolerance - warmth);
      ind.warmth = clamp01(1 - exposure - (shortage ? 0.1 : 0));
      const target = (ind.food + ind.warmth) / 2;
      ind.health = clamp01(ind.health * 0.6 + target * 0.4);
    }

    // ── age + die (local biome pressures) ──
    for (const ind of alive) {
      ind.age++;
      if (this.settlementRng.chance(this.mortalityProb(ind, e, st.shelter, b, cold))) {
        ind.alive = false;
        s.totals.deaths++;
      }
    }

    // ── reproduce ──
    this.reproduceSettlement(st, e, b, cold, cookingActive);

    // ── shelter upgrade + soft food cap ──
    this.tryUpgradeSettlementShelter(st);
    st.resources.food = Math.min(
      st.resources.food,
      this.carryingCapacity(e, st.shelter, b) * BALANCE.foodStoragePerCapacity,
    );
  }

  /** Assign a settlement's able adults to tasks by its own allocation. */
  private distributeForSettlement(
    alive: Individual[],
    allocation: TaskAllocation,
  ): Record<Task, Individual[]> {
    const adults = alive.filter(
      (i) => i.age >= this.config.reproMinAge - 4 && i.health > 0.15,
    );
    // Same id-order invariant as distributeWorkers: a settlement's members are only
    // ever appended with increasing ids, so the filtered adults are already id-sorted.
    const pool = adults;
    const out = Object.fromEntries(TASKS.map((t) => [t, [] as Individual[]])) as Record<
      Task,
      Individual[]
    >;
    let idx = 0;
    for (const task of TASKS) {
      if (task === "idle") continue;
      const want = allocation[task];
      for (let n = 0; n < want && idx < pool.length; n++) out[task].push(pool[idx++]);
    }
    while (idx < pool.length) out.idle.push(pool[idx++]);
    return out;
  }

  /**
   * A settlement's researchers push points onto the shared knowledge tree's
   * current target — the same model as {@link doResearch}, but its raw-resource
   * gate reads the home stock (the tribe's shared store) so resource-gated techs
   * never silently spend a settlement's own pool.
   */
  private settlementResearch(researchers: Individual[], e: Required<TechEffects>): void {
    const s = this.state;
    if (researchers.length === 0) return;
    if (
      !s.researchTarget ||
      s.knowledge.has(s.researchTarget) ||
      !s.knowledge.isUnlocked(s.researchTarget)
    ) {
      s.researchTarget = pickResearchTarget(s);
    }
    if (!s.researchTarget) return;
    const cooperation = 1 + 0.06 * s.knowledge.languageLevel();
    let perHead = 0;
    for (const w of researchers) {
      const speechBonus = 1 + w.genome.speech * 0.5;
      perHead += BALANCE.researchBase * (0.5 + w.genome.intelligence) * speechBonus;
    }
    const teamSize = Math.max(1, researchers.length);
    let points = (perHead / teamSize) * Math.pow(teamSize, BALANCE.researchCrowding);
    points *= Math.pow(e.researchMult, BALANCE.researchCompression) * cooperation * (this.config.researchMult ?? 1);
    if (points <= 0) return;
    const req = TECH_TREE[s.researchTarget].resourceCost;
    const ready = !req || this.hasResources(req);
    const completed = s.knowledge.addProgress(s.researchTarget, points, ready);
    if (completed) {
      if (req) this.spendResources(req);
      const def = TECH_TREE[completed];
      const kind: SimEventType = def.unlocksEra ? "milestone" : "discovery";
      this.logEvent(kind, def.unlocksEra ? `${def.name} — the ${def.unlocksEra} begins!` : `Discovered ${def.name}.`);
      s.researchTarget = pickResearchTarget(s);
    }
  }

  /** Reproduction within a settlement — mirrors {@link reproduce} on its own pool. */
  private reproduceSettlement(
    st: Settlement,
    e: Required<TechEffects>,
    b: BiomeProfile,
    cold: number,
    cookingActive: boolean,
  ): void {
    const s = this.state;
    const alive = st.members.filter((m) => m.alive);
    const adults = alive.filter(
      (i) => i.age >= this.config.reproMinAge && i.age <= this.config.reproMaxAge && i.health > 0.3,
    );
    const females = adults.filter((i) => i.sex === "f");
    const males = adults.filter((i) => i.sex === "m");
    if (females.length === 0 || males.length === 0) return;

    const capacity = this.carryingCapacity(e, st.shelter, b);
    let pop = alive.length;
    const foodSecurity = clamp01(st.resources.food / (pop * 2 + 1));
    const { weights: fw, total: ft } = fitnessWeights(s.policies, females, e, b, cold, cookingActive);
    const { weights: mw, total: mt } = fitnessWeights(s.policies, males, e, b, cold, cookingActive);

    for (let n = 0; n < females.length; n++) {
      if (pop >= capacity) break;
      if (st.resources.food < BALANCE.birthFoodCost) break;
      const mother = pickByWeights(females, fw, ft, this.settlementRng);
      const pBirth = 0.85 * e.birthMult * mother.health * (0.45 + 0.55 * foodSecurity);
      if (!this.settlementRng.chance(pBirth)) continue;
      const father = pickByWeights(males, mw, mt, this.settlementRng);
      const childGenome = inherit(mother.genome, father.genome, this.settlementRng, this.config.mutationRate);
      const child = this.makeIndividual(
        childGenome,
        Math.max(mother.generation, father.generation) + 1,
        0,
        mother.id,
        father.id,
        this.settlementRng,
      );
      if (mother.lineage || father.lineage) child.lineage = mother.lineage ?? father.lineage;
      st.members.push(child);
      st.resources.food -= BALANCE.birthFoodCost;
      s.totals.births++;
      pop++;
    }
  }

  /** Upgrade a settlement's shelter from its own labour + raw resources. */
  private tryUpgradeSettlementShelter(st: Settlement): void {
    const idx = SHELTERS.indexOf(st.shelter);
    if (idx >= SHELTERS.length - 1) return;
    const next = SHELTERS[idx + 1];
    const def = SHELTER_DEF[next];
    if (eraIndex(this.state.era) < eraIndex(def.minEra)) return; // era-gated (shared era)
    if (st.resources.buildProgress < def.buildCost) return; // labor gate
    if (!this.hasResourcesIn(st.resources, def.cost)) return; // raw-material gate
    st.resources.buildProgress -= def.buildCost;
    this.spendResourcesIn(st.resources, def.cost);
    st.shelter = next;
    this.logEvent("milestone", `${st.name} builds a ${next}.`);
  }

  // ── save / load ──────────────────────────────────────────────────────────

  /** Serialize the entire run to a JSON string (RNG state included). */
  serialize(): string {
    // The home settlement (settlements[0]) is a live view whose members/resources/
    // allocation alias the top-level state; store it trimmed to avoid duplicating
    // those (re-aliased on load). Founded settlements are stored in full.
    const settlements = this.state.settlements.map((st, i) =>
      i === 0
        ? { id: st.id, name: st.name, region: st.region, biome: st.biome, shelter: st.shelter }
        : st,
    );
    return JSON.stringify({
      version: SAVE_VERSION,
      config: this.config,
      rng: this.rng.getState(),
      rivalRng: this.rivalRng.getState(),
      settlementRng: this.settlementRng.getState(),
      epidemicRng: this.epidemicRng.getState(),
      nextId: this.nextId,
      allocation: this.allocation,
      state: { ...this.state, knowledge: this.state.knowledge.serialize(), culture: this.state.culture.serialize(), policies: this.state.policies.serialize(), settlements },
    });
  }

  /** Rebuild a Simulation from {@link serialize}. Resumes the RNG identically. */
  static load(json: string): Simulation {
    const data = migrateSave(JSON.parse(json));
    const sim = new Simulation(data.config);
    sim.rng.setState(data.rng);
    if (typeof data.rivalRng === "number") sim.rivalRng.setState(data.rivalRng);
    if (typeof data.settlementRng === "number") sim.settlementRng.setState(data.settlementRng);
    if (typeof data.epidemicRng === "number") sim.epidemicRng.setState(data.epidemicRng);
    sim.nextId = data.nextId ?? sim.nextId;
    sim.allocation = data.allocation ?? sim.allocation;
    sim.state = {
      ...(data.state as unknown as SimState),
      knowledge: Knowledge.deserialize(data.state.knowledge),
      culture: Culture.deserialize(data.state.culture),
      policies: Policies.deserialize(data.state.policies),
    };
    sim.state.settlements = sim.rebuildSettlements(data.state.settlements as Settlement[] | undefined);
    return sim;
  }

  /**
   * Reconstruct the settlements array on load: settlements[0] is the home view,
   * re-aliased to the freshly-deserialized top-level members/resources/allocation;
   * any founded settlements are restored as-is. Tolerates pre-settlement saves.
   */
  private rebuildSettlements(raw: Settlement[] | undefined): Settlement[] {
    const s = this.state;
    const stored = Array.isArray(raw) ? raw[0] : undefined;
    const home: Settlement = {
      id: stored?.id ?? "home",
      name: stored?.name ?? regionById(s.region).name,
      region: s.region,
      biome: s.biome,
      shelter: s.shelter,
      resources: s.resources,
      members: s.individuals,
      allocation: this.allocation,
    };
    const out: Settlement[] = [home];
    if (Array.isArray(raw)) for (let i = 1; i < raw.length; i++) out.push(raw[i]);
    return out;
  }
}
