import type { Era, ResourceCost, Shelter } from "./types.js";
import { ERAS } from "./types.js";

/** Tunables grouped so the balance is in one readable place. */
export const BALANCE = {
  consumptionPerCapita: 0.9,
  cookedConsumptionFactor: 0.7,
  gatherBase: 4.5,
  huntBase: 4.5,
  researchBase: 1.25,
  researchCompression: 0.5, // sub-linear exponent on the aggregate research multiplier
  researchCrowding: 0.82, // diminishing returns as the research team grows (coordination cost)
  buildBase: 1.0,
  // Carryable raw resources gathered per worker, scaled by per-biome availability
  // (see BiomeProfile.wood/stone/hide). Builders cut wood + quarry stone; hunters
  // take hide from the game they bring down.
  woodPerBuilder: 0.7,
  stonePerBuilder: 0.5,
  hidePerHunter: 0.35,
  coldLethality: 0.24,
  // Seasonal swing: how hard winter bites and summer rewards. Both are amplitudes
  // around the yearly mean (the mean cold/abundance is unchanged), so deepening
  // them sharpens scarcity-vs-growth windows without shifting overall balance.
  // Winter (season 0) is coldest + leanest; summer (season 0.5) warmest + richest.
  seasonColdSwing: 0.24, // ± added to ambient cold across the year (was 0.18)
  seasonAbundanceSwing: 0.28, // ± on the food multiplier, anti-phased with cold (was 0.2, sin-phased)
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
  foundFoodPerHead: 3, // provisions each migrant carries to a newly founded settlement
  foodStoragePerCapacity: 9, // soft cap: max stored food = carryingCapacity * this (bounds hoarding)
  // Scouting: idle hands sent out to chart the fogged regions of the world map.
  scoutBase: 0.05, // exploration progress per idle scout per tick toward the next region
  scoutCacheChance: 0.55, // chance a newly charted region yields a raw-resource cache (else a foraging find)
  scoutCacheAmount: 14, // base raw-resource units in a scouting cache (scaled by the region's biome)
  scoutEventFood: 12, // food a foraging party brings back when a charted region holds no cache
  eventChainInterval: 37, // ticks between possible choice-driven event chains
  // Diplomacy: periodic encounters with a rival that trade food for relations.
  diplomacyInterval: 43, // ticks between possible diplomacy events
  diploReciprocateCost: 6, // food sent back when reciprocating a gift
  diploGiftKept: 10, // food gained by keeping a gift and giving nothing back
  diploTributeCost: 8, // food paid to defuse a border tension
  diploAidCost: 7, // food sent in answer to a request for aid
  diploRelUp: 0.2, // relations gained by the generous response
  diploRelDown: 0.2, // relations lost by the self-serving response
  // Trade: a rival this friendly offers to trade your surplus food for goods or lore.
  diploTradeMinRelations: 0.5, // relations at/above which a friendly rival proposes a trade
  diploTradeFoodCost: 10, // surplus food given up in a trade
  diploTradeMaterials: 12, // materials gained trading food for goods
  diploTradeInsight: 30, // research points gained trading food for knowledge
  diploTradeRelUp: 0.1, // relations warmed a little by a fair trade
  // Belief track: culture accrues passively from each discovered culture-category
  // tech (burial/art/republic…) and in chunks from ritual event chains.
  culturePerCultureTech: 0.2, // culture per discovered culture-tech, per tick
  cultureRitual: 14, // culture from resolving a ritual/belief event chain
  // Epidemics: occasional, severe disease outbreaks layered on top of the endemic
  // disease in mortalityProb. Severity scales with crowding (pop/capacity), the
  // biome's diseaseMult and the era (denser settlements spread sickness faster),
  // and is attenuated by medicine/sanitation/vaccines (diseaseDefense). All terms
  // are bounded so an outbreak can hurt but never wipe a tribe out — survival is
  // weighted hard toward diseaseResistance, so epidemics select for it.
  epidemicInterval: 67, // ticks between possible epidemics (prime, distinct from eventInterval)
  epidemicChance: 0.5, // chance an epidemic actually breaks out on an interval tick
  epidemicMinPop: 6, // outbreaks never fire below this headcount (don't doom a recovering tribe)
  epidemicBaseSeverity: 0.5, // base per-fully-susceptible death probability before scaling
  epidemicDensityFloor: 0.4, // density term at zero crowding (a floor, so sparse tribes still risk a little)
  epidemicDensityScale: 0.8, // extra density term at full crowding (pop == capacity)
  epidemicEraScale: 0.06, // severity multiplier added per era index (Paleolithic 0 … Information 8)
  epidemicMaxSeverity: 0.7, // hard ceiling on severity (bounds the worst outbreak; never a guaranteed wipe)
  epidemicSelectionExponent: 1.6, // >1 makes survival skew harder toward diseaseResistance than endemic disease
};

export interface ShelterDef {
  warmth: number;
  capacity: number; // additive carrying capacity
  buildCost: number; // labor (buildProgress) required
  cost: ResourceCost; // raw resources (wood/stone/hide) consumed on build
  minEra: Era; // earliest era it can be built in
}
export const SHELTER_DEF: Record<Shelter, ShelterDef> = {
  cave: { warmth: 0.15, capacity: 0, buildCost: 0, cost: {}, minEra: "Paleolithic" },
  hut: { warmth: 0.3, capacity: 6, buildCost: 35, cost: { wood: 16, stone: 4, hide: 4 }, minEra: "Paleolithic" },
  village: { warmth: 0.38, capacity: 16, buildCost: 80, cost: { wood: 30, stone: 16, hide: 8 }, minEra: "Neolithic" },
  town: { warmth: 0.45, capacity: 32, buildCost: 170, cost: { wood: 45, stone: 38, hide: 12 }, minEra: "Iron Age" },
  city: { warmth: 0.5, capacity: 60, buildCost: 340, cost: { wood: 70, stone: 75, hide: 20 }, minEra: "Industrial" },
};

export const eraIndex = (e: Era) => ERAS.indexOf(e);
export const cap = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
