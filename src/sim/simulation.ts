import { RNG } from "./rng.js";
import { clamp01, inherit, randomGenome } from "./genome.js";
import { Knowledge, TECH_TREE, TECH_ORDER, eraCapstone } from "./knowledge.js";
import {
  BIOME_PROFILE,
  DEFAULT_REGION,
  regionById,
  regionDistance,
  type BiomeProfile,
} from "./regions.js";
import {
  ERAS,
  LINEAGES,
  SHELTERS,
  TASKS,
  TRAITS,
  type Biome,
  type ChoiceOption,
  type Encounter,
  type Era,
  type EventChainId,
  type PendingChoice,
  type Genome,
  type Individual,
  type Lineage,
  type ResourcePools,
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

/** Tunables grouped so the balance is in one readable place. */
const BALANCE = {
  consumptionPerCapita: 0.9,
  cookedConsumptionFactor: 0.7,
  gatherBase: 4.5,
  huntBase: 4.5,
  researchBase: 1.25,
  researchCompression: 0.5, // sub-linear exponent on the aggregate research multiplier
  researchCrowding: 0.82, // diminishing returns as the research team grows (coordination cost)
  buildBase: 1.0,
  coldLethality: 0.24,
  starveLethality: 0.18,
  diseaseLethality: 0.2,
  predatorLethality: 0.18,
  raidLethality: 0.16,
  chronicDisease: 0.022,
  cookingIntelWeight: 2.0,
  birthFoodCost: 3,
  encounterInterval: 28, // ticks between possible neighbouring-group encounters
  migrateFoodPerHead: 1.6, // food spent per person per unit distance travelled
  migrateRisk: 0.5, // base per-person death chance over a full-map journey
  foodStoragePerCapacity: 9, // soft cap: max stored food = carryingCapacity * this (bounds hoarding)
  eventChainInterval: 37, // ticks between possible choice-driven event chains
};

interface ShelterDef {
  warmth: number;
  capacity: number; // additive carrying capacity
  buildCost: number;
  minEra: Era; // earliest era it can be built in
}
const SHELTER_DEF: Record<Shelter, ShelterDef> = {
  cave: { warmth: 0.15, capacity: 0, buildCost: 0, minEra: "Paleolithic" },
  hut: { warmth: 0.3, capacity: 6, buildCost: 35, minEra: "Paleolithic" },
  village: { warmth: 0.38, capacity: 16, buildCost: 80, minEra: "Neolithic" },
  town: { warmth: 0.45, capacity: 32, buildCost: 170, minEra: "Iron Age" },
  city: { warmth: 0.5, capacity: 60, buildCost: 340, minEra: "Industrial" },
};

/** Trait leanings each neighbouring group contributes when you interbreed. */
const ARCHETYPE: Record<Lineage, Partial<Genome>> = {
  sapiens: { intelligence: 0.22, speech: 0.22, dexterity: 0.08 },
  neanderthal: { strength: 0.24, coldTolerance: 0.2 },
  denisovan: { diseaseResistance: 0.24, coldTolerance: 0.16 },
};
const LINEAGE_NAME: Record<Lineage, string> = {
  sapiens: "a band of early Sapiens",
  neanderthal: "a clan of Neanderthals",
  denisovan: "a group of Denisovans",
};

/**
 * Presentation for each choice-driven event chain. The trade-off logic lives in
 * {@link Simulation.resolveChoice}; this is just the framing the UI shows. Option
 * 0 is always the cautious choice, option 1 the risky one.
 */
const EVENT_CHAIN_DEF: Record<
  EventChainId,
  { title: string; message: string; options: [ChoiceOption, ChoiceOption] }
> = {
  hardWinter: {
    title: "A hard winter",
    message: "The cold bites deep and the stores run thin. How will the tribe endure?",
    options: [
      { label: "Ration the stores", hint: "spend food, no one is lost" },
      { label: "Risk a winter hunt", hint: "more food, but the weak may not return" },
    ],
  },
  sickCamp: {
    title: "Sickness in the camp",
    message: "A fever spreads through the band. Tend the afflicted or let it run its course?",
    options: [
      { label: "Tend the sick", hint: "spend food, the camp recovers" },
      { label: "Let it run", hint: "costs nothing, but the frail may die" },
    ],
  },
  rivalCache: {
    title: "A rival's granary",
    message: "Scouts find a neighbouring camp's food cache. Bargain for a share, or take it?",
    options: [
      { label: "Trade for a share", hint: "some food, no blood spilled" },
      { label: "Raid the cache", hint: "much more food, but lives at risk" },
    ],
  },
};

const eraIndex = (e: Era) => ERAS.indexOf(e);
const cap = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export interface SimState {
  tick: number;
  individuals: Individual[];
  resources: ResourcePools;
  knowledge: Knowledge;
  world: WorldState;
  shelter: Shelter;
  region: string;
  biome: Biome;
  era: Era;
  generation: number;
  /** Win: the tribe has become modern humans. */
  won: boolean;
  cookingActive: boolean;
  log: SimEvent[];
  researchTarget: TechId | null;
  pendingEncounter: Encounter | null;
  pendingChoice: PendingChoice | null;
  /** Lifetime tallies for the chronicle / stats / achievement screens. */
  totals: {
    births: number;
    deaths: number;
    interbred: number;
    /** Times the tribe has migrated to a new region this run. */
    migrations: number;
    /** Largest living population reached this run. */
    peakPopulation: number;
  };
  /** A short, human-readable description of the next objective. */
  goal: string;
}

export interface TraitAverages {
  count: number;
  traits: Record<TraitName, number>;
}

export class Simulation {
  readonly config: SimConfig;
  private rng: RNG;
  private nextId = 1;
  state: SimState;
  allocation: TaskAllocation;

  constructor(config: Partial<SimConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rng = new RNG(this.config.seed);
    this.allocation = Object.fromEntries(TASKS.map((t) => [t, 0])) as TaskAllocation;
    this.state = this.createInitialState();
  }

  // ── setup ────────────────────────────────────────────────────────────────

  private createInitialState(): SimState {
    const individuals: Individual[] = [];
    for (let i = 0; i < this.config.startingPopulation; i++) {
      individuals.push(this.makeIndividual(this.founderGenome(), 0, this.rng.int(14, 28)));
    }
    const knowledge = new Knowledge();
    const region = regionById(this.config.startRegion ?? DEFAULT_REGION);
    return {
      tick: 0,
      individuals,
      resources: { food: this.config.startingFood ?? 20, materials: 0, buildProgress: 0 },
      knowledge,
      world: { cold: this.config.baseCold, abundance: 1, season: 0, seasonIndex: 0 },
      shelter: "cave",
      region: region.id,
      biome: region.biome,
      era: "Paleolithic",
      generation: 0,
      won: false,
      cookingActive: false,
      log: [],
      researchTarget: knowledge.available()[0] ?? null,
      pendingEncounter: null,
      pendingChoice: null,
      totals: { births: 0, deaths: 0, interbred: 0, migrations: 0, peakPopulation: individuals.length },
      goal: "",
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
  ): Individual {
    return {
      id: this.nextId++,
      genome,
      sex: this.rng.chance(0.5) ? "f" : "m",
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
    s.totals.migrations++;
    this.logEvent("milestone", `The tribe migrates to ${target.name} (${target.biome})${deaths ? ` — ${deaths} lost on the journey` : ""}.`);
    return deaths;
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
   * Cached snapshot of the living individuals, rebuilt lazily. The full
   * individuals array grows with every birth and is filtered many times per
   * tick, so we keep one filtered list and invalidate it whenever the living
   * set changes (births, deaths, migration). Behaviour is identical to the old
   * per-call filter: callers never mutate the returned array in place.
   */
  private livingCache: Individual[] | null = null;

  private invalidateLiving(): void {
    this.livingCache = null;
  }

  get living(): Individual[] {
    if (this.livingCache === null) {
      this.livingCache = this.state.individuals.filter((i) => i.alive);
    }
    return this.livingCache;
  }

  /** Look up any individual (living or dead) by id — for the family tree. */
  individualById(id: number): Individual | undefined {
    return this.state.individuals.find((i) => i.id === id);
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

  // ── main loop ──────────────────────────────────────────────────────────────

  tick(): void {
    const s = this.state;
    s.tick++;

    const effects = s.knowledge.aggregateEffects();
    this.updateWorld(effects);
    this.distributeWorkers();
    this.produce(effects);
    this.consumeAndUpdateNeeds(effects);
    this.ageAndDie(effects);
    this.maybeEvent(effects);
    this.maybeEncounter();
    this.maybeEventChain();
    this.reproduce(effects);
    this.tryUpgradeShelter();
    this.updateEraAndGeneration();
    s.totals.peakPopulation = Math.max(s.totals.peakPopulation, this.living.length);

    // Soft storage cap: surplus food can't grow unbounded — it's bounded by the
    // tribe's carrying capacity (shelter tier / biome / tech), keeping mid/late
    // game tension. Clamped after every tick so observers always see it bounded.
    s.resources.food = Math.min(s.resources.food, this.foodStorageCap(effects));
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.tick();
  }

  private biome(): BiomeProfile {
    return BIOME_PROFILE[this.state.biome];
  }

  private updateWorld(e: Required<TechEffects>): void {
    const w = this.state.world;
    const b = this.biome();
    w.seasonIndex = this.state.tick % 4;
    w.season = w.seasonIndex / 4;
    const seasonal = Math.cos(w.season * Math.PI * 2) * 0.18;
    w.cold = clamp01(this.config.baseCold + b.coldAdd + seasonal);
    w.abundance =
      (0.9 + Math.sin(w.season * Math.PI * 2) * 0.2 + e.abundance + (this.config.abundanceBonus ?? 0)) *
      b.abundance;
  }

  private workers: Record<Task, Individual[]> = {} as Record<Task, Individual[]>;

  private distributeWorkers(): void {
    const adults = this.living.filter(
      (i) => i.age >= this.config.reproMinAge - 4 && i.health > 0.15,
    );
    const pool = [...adults].sort((a, b) => a.id - b.id);
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

  private produce(e: Required<TechEffects>): void {
    const s = this.state;
    const k = s.knowledge;

    const b = this.biome();
    let food = 0;
    for (const w of this.workers.gather) {
      const techMult = k.has("gathering") ? 1 : 0.95;
      food += BALANCE.gatherBase * (0.5 + w.genome.dexterity) * e.gatherMult * b.gatherMult * techMult * s.world.abundance;
    }
    for (const w of this.workers.hunt) {
      const techMult = k.has("hunting") ? 1 : 0.6;
      food += BALANCE.huntBase * (0.5 + w.genome.strength) * e.huntMult * b.huntMult * techMult * s.world.abundance;
    }
    food *= e.foodMult;
    s.resources.food += food;

    s.cookingActive = k.has("cooking") && this.workers.cook.length > 0 && s.resources.food > 0;

    let build = 0;
    for (const w of this.workers.build)
      build += BALANCE.buildBase * (0.5 + w.genome.strength * 0.5 + w.genome.dexterity * 0.5) * e.buildMult;
    s.resources.buildProgress += build;
    s.resources.materials += build * 0.2;

    this.doResearch(e);
  }

  private doResearch(e: Required<TechEffects>): void {
    const s = this.state;
    if (
      !s.researchTarget ||
      s.knowledge.has(s.researchTarget) ||
      !s.knowledge.isUnlocked(s.researchTarget)
    ) {
      s.researchTarget = this.pickResearchTarget();
    }
    if (!s.researchTarget) return;

    // Cooperation grows with the language chain — teamwork multiplies ideas.
    const cooperation = 1 + 0.06 * s.knowledge.languageLevel();
    let perHead = 0;
    for (const w of this.workers.research) {
      const speechBonus = 1 + w.genome.speech * 0.5;
      perHead += BALANCE.researchBase * (0.5 + w.genome.intelligence) * speechBonus;
    }
    // Diminishing returns as the team grows (coordination cost) keeps a huge
    // late-game population from making research instantaneous.
    const teamSize = Math.max(1, this.workers.research.length);
    let points = (perHead / teamSize) * Math.pow(teamSize, BALANCE.researchCrowding);
    // Compress the accumulated research multiplier: knowledge still accelerates
    // progress, but sub-linearly, so the late eras stay visible rather than
    // collapsing into a single tick once the multipliers compound.
    points *= Math.pow(e.researchMult, BALANCE.researchCompression) * cooperation;
    if (points <= 0) return;

    const completed = s.knowledge.addProgress(s.researchTarget, points);
    if (completed) {
      const def = TECH_TREE[completed];
      const kind: SimEventType = def.unlocksEra ? "milestone" : "discovery";
      this.logEvent(kind, def.unlocksEra ? `${def.name} — the ${def.unlocksEra} begins!` : `Discovered ${def.name}.`);
      s.researchTarget = this.pickResearchTarget();
    }
  }

  private pickResearchTarget(): TechId | null {
    const avail = this.state.knowledge.available();
    if (avail.length === 0) return null;
    for (const t of TECH_ORDER) if (avail.includes(t)) return t;
    return avail[0];
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
      if (this.rng.chance(this.mortalityProb(ind, e))) {
        ind.alive = false;
        s.totals.deaths++;
        this.invalidateLiving();
      }
    }
  }

  private mortalityProb(ind: Individual, e: Required<TechEffects>): number {
    const s = this.state;
    let p = 0;
    if (ind.age > this.config.reproMaxAge) {
      p += 0.02 + Math.pow(
        (ind.age - this.config.reproMaxAge) / (this.config.maxAge - this.config.reproMaxAge), 2,
      ) * 0.5;
    }
    const warmth = SHELTER_DEF[s.shelter].warmth + e.warmth;
    const exposure = clamp01(s.world.cold - ind.genome.coldTolerance - warmth);
    p += exposure * BALANCE.coldLethality;
    if (ind.food <= 0.05) p += BALANCE.starveLethality;
    // Endemic disease, scaled by the biome and attenuated by medicine/sanitation.
    p += (1 - ind.genome.diseaseResistance) * BALANCE.chronicDisease * this.biome().diseaseMult * (1 - e.diseaseDefense);
    p += (1 - ind.health) * 0.04;
    return clamp01(p);
  }

  private maybeEvent(e: Required<TechEffects>): void {
    const s = this.state;
    if (s.tick % this.config.eventInterval !== 0) return;

    const roll = this.rng.next();
    const b = this.biome();
    const settled = eraIndex(s.era) >= eraIndex("Bronze Age");
    // Difficulty preset scales how deadly random events are; 1 = standard.
    const lethal = this.config.eventLethality ?? 1;
    if (roll < 0.35) {
      this.applyHazard("diseaseResistance", BALANCE.diseaseLethality * lethal * b.diseaseMult * (1 - e.diseaseDefense));
      this.logEvent("disease", "A sickness sweeps the camp.");
    } else if (roll < 0.62) {
      // Predators in the wild; organised raids once settled.
      if (settled) {
        this.applyHazard("strength", BALANCE.raidLethality * lethal * e.defenseMult);
        this.logEvent("raid", "Raiders strike at the settlement.");
      } else {
        this.applyHazard("strength", BALANCE.predatorLethality * lethal * b.predatorMult * e.defenseMult);
        this.logEvent("predator", "Predators stalk the tribe.");
      }
    } else if (roll < 0.8) {
      this.applyHazard("coldTolerance", BALANCE.coldLethality * lethal * 0.8);
      this.logEvent("coldSnap", "A savage cold snap descends.");
    } else {
      s.resources.food += 12 * s.world.abundance;
      this.logEvent("bounty", "A season of plenty — food is abundant.");
    }
  }

  private applyHazard(trait: TraitName, lethality: number): number {
    const s = this.state;
    let deaths = 0;
    for (const ind of this.living) {
      if (this.rng.chance(clamp01((1 - ind.genome[trait]) * lethality))) {
        ind.alive = false;
        s.totals.deaths++;
        this.invalidateLiving();
        deaths++;
      }
    }
    return deaths;
  }

  /**
   * Interbreeding with other hominin groups. While the tribe is still archaic
   * (Paleolithic/Neolithic), neighbouring bands occasionally appear; accepting
   * the encounter injects their beneficial alleles into the gene pool — a real
   * jump in trait averages plus fresh variance for selection to work on.
   */
  private maybeEncounter(): void {
    const s = this.state;
    if (s.pendingEncounter) {
      if (s.tick > s.pendingEncounter.expiresTick) {
        this.logEvent("encounter", `${cap(LINEAGE_NAME[s.pendingEncounter.lineage])} moved on.`);
        s.pendingEncounter = null;
      }
      return;
    }
    const archaic = eraIndex(s.era) <= eraIndex("Neolithic");
    if (!archaic || this.living.length < 6) return;
    if (s.tick % BALANCE.encounterInterval !== 0) return;
    if (!this.rng.chance(0.5)) return;

    const lineage = this.rng.pick(LINEAGES);
    s.pendingEncounter = {
      lineage,
      message: `You meet ${LINEAGE_NAME[lineage]}. Interbreed to share their strengths?`,
      expiresTick: s.tick + 6,
    };
    this.logEvent("encounter", s.pendingEncounter.message);
  }

  /** Resolve a pending encounter. Accepting injects new, archetype-leaning kin. */
  resolveEncounter(accept: boolean): void {
    const s = this.state;
    const enc = s.pendingEncounter;
    if (!enc) return;
    s.pendingEncounter = null;
    if (!accept) {
      this.logEvent("encounter", `The tribe kept to itself.`);
      return;
    }
    const avg = this.traitAverages().traits;
    const lean = ARCHETYPE[enc.lineage];
    const newcomers = this.rng.int(2, 3);
    for (let i = 0; i < newcomers; i++) {
      const genome = {} as Genome;
      for (const t of TRAITS) {
        genome[t] = clamp01(avg[t] + (lean[t] ?? 0) + this.rng.gauss(0, 0.05));
      }
      const ind = this.makeIndividual(genome, s.generation, this.rng.int(16, 26));
      ind.lineage = enc.lineage;
      s.individuals.push(ind);
      this.invalidateLiving();
      s.totals.births++;
    }
    s.totals.interbred++;
    this.logEvent("encounter", `Interbred with ${LINEAGE_NAME[enc.lineage]} — new blood strengthens the line.`);
  }

  /**
   * Choice-driven event chains. Like {@link maybeEncounter}, these surface a
   * pending decision with a trade-off that the player (or autopilot) resolves via
   * {@link resolveChoice}; ignored, they expire. Only one decision is offered at a
   * time so the UI never has to stack two modals.
   */
  private maybeEventChain(): void {
    const s = this.state;
    if (s.pendingChoice) {
      if (s.tick > s.pendingChoice.expiresTick) {
        this.logEvent("choice", `The moment to act passed — ${s.pendingChoice.title.toLowerCase()} went unanswered.`);
        s.pendingChoice = null;
      }
      return;
    }
    if (s.pendingEncounter) return;
    if (this.living.length < 4) return;
    if (s.tick % BALANCE.eventChainInterval !== 0) return;
    if (!this.rng.chance(0.5)) return;

    const eligible = this.eligibleEventChains();
    if (eligible.length === 0) return;
    const id = this.rng.pick(eligible);
    s.pendingChoice = { id, ...EVENT_CHAIN_DEF[id], expiresTick: s.tick + 6 };
    this.logEvent("choice", s.pendingChoice.message);
  }

  /** Which event chains the current world state can offer right now. */
  private eligibleEventChains(): EventChainId[] {
    const s = this.state;
    const out: EventChainId[] = [];
    if (s.world.cold > 0.5) out.push("hardWinter");
    if (this.living.length >= 8) out.push("sickCamp");
    if (eraIndex(s.era) >= eraIndex("Bronze Age")) out.push("rivalCache");
    return out;
  }

  /**
   * Resolve a pending choice. Option 0 is the cautious branch (a sure cost),
   * option 1 the risky branch (a bigger payoff at the cost of lives).
   */
  resolveChoice(option: number): void {
    const s = this.state;
    const c = s.pendingChoice;
    if (!c) return;
    s.pendingChoice = null;
    const risky = option === 1;
    switch (c.id) {
      case "hardWinter":
        if (risky) {
          const gain = 18 * s.world.abundance;
          s.resources.food += gain;
          const lost = this.applyHazard("strength", BALANCE.predatorLethality);
          this.logEvent("choice", `A winter hunt brings ${Math.round(gain)} food${lost ? ` — ${lost} did not return` : ""}.`);
        } else {
          s.resources.food = Math.max(0, s.resources.food - 8);
          this.logEvent("choice", "The tribe rations its stores and waits out the cold.");
        }
        break;
      case "sickCamp":
        if (risky) {
          const lost = this.applyHazard("diseaseResistance", BALANCE.diseaseLethality);
          this.logEvent("choice", `The fever runs its course${lost ? ` — ${lost} did not recover` : ""}.`);
        } else {
          s.resources.food = Math.max(0, s.resources.food - 6);
          for (const ind of this.living) ind.health = clamp01(ind.health + 0.15);
          this.logEvent("choice", "The tribe tends its sick back to health.");
        }
        break;
      case "rivalCache":
        if (risky) {
          const gain = 24 * s.world.abundance;
          s.resources.food += gain;
          const lost = this.applyHazard("strength", BALANCE.raidLethality);
          this.logEvent("choice", `The tribe raids the cache for ${Math.round(gain)} food${lost ? ` — ${lost} fell in the fight` : ""}.`);
        } else {
          const gain = 8 * s.world.abundance;
          s.resources.food += gain;
          this.logEvent("choice", `The tribe trades for ${Math.round(gain)} food, keeping the peace.`);
        }
        break;
    }
  }

  private reproduce(e: Required<TechEffects>): void {
    const s = this.state;
    const adults = this.living.filter(
      (i) => i.age >= this.config.reproMinAge && i.age <= this.config.reproMaxAge && i.health > 0.3,
    );
    const females = adults.filter((i) => i.sex === "f");
    const males = adults.filter((i) => i.sex === "m");
    if (females.length === 0 || males.length === 0) return;

    const capacity = this.carryingCapacity(e);
    let pop = this.living.length;
    const foodSecurity = clamp01(s.resources.food / (pop * 2 + 1));

    for (let n = 0; n < females.length; n++) {
      if (pop >= capacity) break;
      if (s.resources.food < BALANCE.birthFoodCost) break;
      const mother = this.selectByFitness(females, e);
      const pBirth = 0.85 * e.birthMult * mother.health * (0.45 + 0.55 * foodSecurity);
      if (!this.rng.chance(pBirth)) continue;

      const father = this.selectByFitness(males, e);
      const childGenome = inherit(mother.genome, father.genome, this.rng, this.config.mutationRate);
      const child = this.makeIndividual(
        childGenome,
        Math.max(mother.generation, father.generation) + 1,
        0,
        mother.id,
        father.id,
      );
      if (mother.lineage || father.lineage) child.lineage = mother.lineage ?? father.lineage;
      s.individuals.push(child);
      this.invalidateLiving();
      s.resources.food -= BALANCE.birthFoodCost;
      s.totals.births++;
      pop++;
    }
  }

  carryingCapacity(e: Required<TechEffects>): number {
    return (
      this.config.carryingCapacityBase +
      SHELTER_DEF[this.state.shelter].capacity +
      this.biome().capacity +
      e.capacityBonus
    );
  }

  /** Soft upper bound on stored food, scaled by the tribe's carrying capacity. */
  foodStorageCap(e: Required<TechEffects>): number {
    return this.carryingCapacity(e) * BALANCE.foodStoragePerCapacity;
  }

  private selectByFitness(pool: Individual[], e: Required<TechEffects>): Individual {
    const weights = pool.map((m) => this.fitness(m, e));
    let total = 0;
    for (const w of weights) total += w;
    let r = this.rng.next() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  private fitness(ind: Individual, e: Required<TechEffects>): number {
    const s = this.state;
    const b = this.biome();
    let f = 0.2 + ind.health;
    f += ind.genome.coldTolerance * s.world.cold;
    f += ind.genome.strength * 0.3 + ind.genome.dexterity * 0.2;
    // The biome rewards a particular trait — location shapes the lineage.
    f += ind.genome[b.selectTrait] * b.selectWeight;
    // Cooked food + schooling reward bigger brains.
    const intelPressure = (s.cookingActive || ind.ateCooked ? BALANCE.cookingIntelWeight : 0) + e.intelPressure;
    if (intelPressure > 0) f += ind.genome.intelligence * intelPressure;
    return Math.max(0.01, f);
  }

  private tryUpgradeShelter(): void {
    const s = this.state;
    const idx = SHELTERS.indexOf(s.shelter);
    if (idx >= SHELTERS.length - 1) return;
    const next = SHELTERS[idx + 1];
    const def = SHELTER_DEF[next];
    if (eraIndex(s.era) < eraIndex(def.minEra)) return; // era-gated
    if (s.resources.buildProgress >= def.buildCost) {
      s.resources.buildProgress -= def.buildCost;
      s.shelter = next;
      this.logEvent("milestone", `The tribe builds a ${next}.`);
    }
  }

  private updateEraAndGeneration(): void {
    const s = this.state;
    const era = s.knowledge.currentEra();
    if (era !== s.era && !s.won) {
      // era change logged via the capstone discovery already
    }
    s.era = era;
    if (era === "Information" && !s.won) {
      s.won = true;
      this.logEvent("milestone", "The Information Age dawns — your people reshape the world. The journey is complete.");
    }

    let maxGen = 0;
    for (const ind of this.living) if (ind.generation > maxGen) maxGen = ind.generation;
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

  protected logEvent(type: SimEventType, message: string): void {
    this.state.log.push({ type, tick: this.state.tick, message });
    if (this.state.log.length > 60) this.state.log.shift();
  }

  // ── save / load ──────────────────────────────────────────────────────────

  /** Serialize the entire run to a JSON string (RNG state included). */
  serialize(): string {
    return JSON.stringify({
      v: 1,
      config: this.config,
      rng: this.rng.getState(),
      nextId: this.nextId,
      allocation: this.allocation,
      state: { ...this.state, knowledge: this.state.knowledge.serialize() },
    });
  }

  /** Rebuild a Simulation from {@link serialize}. Resumes the RNG identically. */
  static load(json: string): Simulation {
    const data = JSON.parse(json);
    const sim = new Simulation(data.config);
    sim.rng.setState(data.rng);
    sim.nextId = data.nextId;
    sim.allocation = data.allocation;
    sim.state = { ...data.state, knowledge: Knowledge.deserialize(data.state.knowledge) };
    return sim;
  }
}
