import { ERAS, LINEAGES, type Era, type Lineage, type SimState } from "../sim/index.js";

/**
 * A small achievements layer. Detection is a pure function of a sim snapshot
 * ({@link detectAchievements}); the controller folds unlocks into a sticky set
 * ({@link mergeUnlocked}) and the UI only displays them. localStorage IO lives at
 * the bottom and is kept thin, mirroring {@link ../game/legacy.ts}.
 */
export const ACHIEVEMENT_IDS = [
  "neolithic",
  "bronze",
  "classical",
  "victory",
  "meltingPot",
  "fullHouse",
  "tundraborn",
  "homebody",
] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export interface Achievement {
  id: AchievementId;
  title: string;
  description: string;
  /** Pure predicate over a sim snapshot. */
  check: (s: SimState) => boolean;
}

/** Living population the tribe must reach for the "Full House" badge. */
export const POPULATION_MILESTONE = 30;

const reachedEra = (s: SimState, era: Era): boolean =>
  ERAS.indexOf(s.era) >= ERAS.indexOf(era);

const lineagesPresent = (s: SimState): Set<Lineage> => {
  const set = new Set<Lineage>();
  for (const ind of s.individuals) if (ind.lineage) set.add(ind.lineage);
  return set;
};

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "neolithic",
    title: "New Stone Age",
    description: "Reach the Neolithic.",
    check: (s) => reachedEra(s, "Neolithic"),
  },
  {
    id: "bronze",
    title: "Age of Metal",
    description: "Reach the Bronze Age.",
    check: (s) => reachedEra(s, "Bronze Age"),
  },
  {
    id: "classical",
    title: "Cradle of Civilization",
    description: "Reach the Classical era.",
    check: (s) => reachedEra(s, "Classical"),
  },
  {
    id: "victory",
    title: "Information Age",
    description: "Guide a tribe all the way to victory.",
    check: (s) => s.won,
  },
  {
    id: "meltingPot",
    title: "Melting Pot",
    description: "Interbreed with all three hominin lineages.",
    check: (s) => {
      const present = lineagesPresent(s);
      return LINEAGES.every((l) => present.has(l));
    },
  },
  {
    id: "fullHouse",
    title: "Full House",
    description: `Grow the tribe to ${POPULATION_MILESTONE} people.`,
    check: (s) => s.totals.peakPopulation >= POPULATION_MILESTONE,
  },
  {
    id: "tundraborn",
    title: "Children of the Ice",
    description: "Reach the Bronze Age without ever leaving the tundra.",
    check: (s) => reachedEra(s, "Bronze Age") && s.biome === "tundra" && s.totals.migrations === 0,
  },
  {
    id: "homebody",
    title: "Homebound",
    description: "Win without ever migrating.",
    check: (s) => s.won && s.totals.migrations === 0,
  },
];

/** Pure: ids whose condition the snapshot currently satisfies. */
export function detectAchievements(s: SimState): AchievementId[] {
  return ACHIEVEMENTS.filter((a) => a.check(s)).map((a) => a.id);
}

/**
 * Pure: fold newly-satisfied ids into the already-unlocked set. Achievements are
 * sticky — once earned they stay earned even if the sim later regresses — and the
 * result is returned in canonical {@link ACHIEVEMENT_IDS} order.
 */
export function mergeUnlocked(prev: readonly AchievementId[], s: SimState): AchievementId[] {
  const set = new Set<AchievementId>(prev);
  for (const id of detectAchievements(s)) set.add(id);
  return ACHIEVEMENT_IDS.filter((id) => set.has(id));
}

// ── localStorage IO ──────────────────────────────────────────────────────────

const KEY = "dawn-of-the-tribe-achievements";

export function loadAchievements(): AchievementId[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw);
    if (!Array.isArray(ids)) return [];
    // Drop anything unknown and re-impose canonical order.
    return ACHIEVEMENT_IDS.filter((id) => ids.includes(id));
  } catch {
    return [];
  }
}

export function saveAchievements(ids: readonly AchievementId[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable — achievements are optional */
  }
}
