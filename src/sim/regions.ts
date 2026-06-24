import { type Biome, type Region, type TraitName } from "./types.js";

/**
 * The explorable world. Each region sits in a biome; migrating there changes the
 * tribe's whole environment — and therefore which traits survival rewards. This
 * is what makes *location* an evolutionary force, not just scenery.
 */
export const REGIONS: Region[] = [
  { id: "frostvale", name: "Frostvale", biome: "tundra", x: 0.16, y: 0.16 },
  { id: "deepwood", name: "Deepwood", biome: "forest", x: 0.4, y: 0.3 },
  { id: "highwood", name: "Highwood", biome: "forest", x: 0.2, y: 0.56 },
  { id: "twin-rivers", name: "Twin Rivers", biome: "river", x: 0.6, y: 0.5 },
  { id: "wide-savanna", name: "Wide Savanna", biome: "grassland", x: 0.42, y: 0.72 },
  { id: "sunscar", name: "Sunscar Dunes", biome: "desert", x: 0.8, y: 0.74 },
  { id: "pearl-coast", name: "Pearl Coast", biome: "coast", x: 0.84, y: 0.34 },
];

export const DEFAULT_REGION = "frostvale";

export function regionById(id: string): Region {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[0];
}

/** Straight-line travel distance between two regions, in [0, ~1.2]. */
export function regionDistance(a: string, b: string): number {
  const ra = regionById(a);
  const rb = regionById(b);
  return Math.hypot(ra.x - rb.x, ra.y - rb.y);
}

/**
 * Map distance within which two regions count as neighbours. Migrating to (or
 * scouting) a region reveals it and everything inside this radius of it — the
 * fog-of-war reveal range. Chosen so the world forms one connected graph.
 */
export const NEIGHBOR_RADIUS = 0.42;

/** Region ids adjacent to `id` — close enough to glimpse from there. */
export function regionNeighbors(id: string): string[] {
  return REGIONS.filter((r) => r.id !== id && regionDistance(id, r.id) <= NEIGHBOR_RADIUS).map(
    (r) => r.id,
  );
}

/** Per-biome environment + the trait its survival pressures reward. */
export interface BiomeProfile {
  coldAdd: number; // added to baseCold
  abundance: number; // food multiplier
  gatherMult: number;
  huntMult: number;
  diseaseMult: number; // scales disease lethality + endemic load
  predatorMult: number; // scales predator lethality
  capacity: number; // additive carrying capacity
  selectTrait: TraitName; // trait this biome rewards in reproduction
  selectWeight: number;
  blurb: string;
}

export const BIOME_PROFILE: Record<Biome, BiomeProfile> = {
  tundra: {
    coldAdd: 0.14, abundance: 0.92, gatherMult: 0.92, huntMult: 1.15,
    diseaseMult: 0.85, predatorMult: 1.1, capacity: 0,
    selectTrait: "coldTolerance", selectWeight: 0.5,
    blurb: "Frozen and lean. Only the cold-hardy endure.",
  },
  forest: {
    coldAdd: 0.04, abundance: 1.05, gatherMult: 1.2, huntMult: 1.2,
    diseaseMult: 1.0, predatorMult: 1.35, capacity: 0,
    selectTrait: "strength", selectWeight: 0.35,
    blurb: "Game and forage aplenty — but predators prowl the trees.",
  },
  river: {
    coldAdd: -0.04, abundance: 1.28, gatherMult: 1.1, huntMult: 1.0,
    diseaseMult: 1.3, predatorMult: 0.9, capacity: 4,
    selectTrait: "diseaseResistance", selectWeight: 0.45,
    blurb: "Fish and fertile mud feed many — but fever haunts the water.",
  },
  grassland: {
    coldAdd: 0.0, abundance: 1.16, gatherMult: 1.15, huntMult: 1.25,
    diseaseMult: 0.95, predatorMult: 1.0, capacity: 6,
    selectTrait: "strength", selectWeight: 0.2,
    blurb: "Open herds and room to grow — the cradle of farming.",
  },
  desert: {
    coldAdd: -0.06, abundance: 0.72, gatherMult: 0.8, huntMult: 0.85,
    diseaseMult: 0.7, predatorMult: 0.9, capacity: -2,
    selectTrait: "dexterity", selectWeight: 0.4,
    blurb: "Scarce and unforgiving. Survival rewards cunning and thrift.",
  },
  coast: {
    coldAdd: -0.02, abundance: 1.22, gatherMult: 1.1, huntMult: 1.0,
    diseaseMult: 1.05, predatorMult: 0.85, capacity: 4,
    selectTrait: "speech", selectWeight: 0.35,
    blurb: "Tides, shellfish and trade — talkers and traders thrive.",
  },
};
