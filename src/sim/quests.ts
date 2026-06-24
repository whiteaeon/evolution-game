/**
 * Objective-driven quests — a small, pure-data layer over the simulation.
 *
 * Each quest is defined once in {@link QUEST_DEFS}; the live, serialize-safe
 * progress lives in {@link QuestProgress} entries on the sim state. Quests are
 * evaluated every tick from a {@link QuestContext} the simulation builds from its
 * own state — the quest layer never reaches back into the sim or the renderer.
 */

export const QUEST_IDS = [
  "reach30",
  "fireBeforeYear30",
  "interbreedAll",
  "surviveWinter",
  "newBiomeSettlement",
] as const;
export type QuestId = (typeof QUEST_IDS)[number];

/** A one-off reward granted when a quest completes. */
export interface QuestReward {
  food?: number;
  materials?: number;
}

/** Everything a quest's progress can be measured from, read-only. */
export interface QuestContext {
  tick: number;
  population: number;
  hasFire: boolean;
  /** Distinct hominin lineages the tribe has interbred with (0..3). */
  lineageCount: number;
  /** Winter ("hard winter") event chains the tribe has lived through. */
  winterChainsSurvived: number;
  /** True once a village-or-better stands in a biome other than the homeland. */
  settlementInNewBiome: boolean;
}

export interface QuestDef {
  id: QuestId;
  title: string;
  description: string;
  /** Progress value that marks the quest complete. */
  target: number;
  reward: QuestReward;
  /** If set, the quest fails once this tick passes without completion. */
  deadline?: number;
  /** Current progress toward {@link target}, derived purely from the context. */
  measure: (ctx: QuestContext) => number;
}

export const QUEST_DEFS: QuestDef[] = [
  {
    id: "reach30",
    title: "A growing people",
    description: "Reach a living population of 30.",
    target: 30,
    reward: { materials: 30 },
    measure: (c) => c.population,
  },
  {
    id: "fireBeforeYear30",
    title: "Tamers of fire",
    description: "Discover fire before year 30.",
    target: 1,
    deadline: 30,
    reward: { food: 20 },
    measure: (c) => (c.hasFire ? 1 : 0),
  },
  {
    id: "interbreedAll",
    title: "Many bloods, one tribe",
    description: "Interbreed with all three hominin lineages.",
    target: 3,
    reward: { materials: 25 },
    measure: (c) => c.lineageCount,
  },
  {
    id: "surviveWinter",
    title: "Endured the cold",
    description: "Live through a hard-winter event chain.",
    target: 1,
    reward: { food: 25 },
    measure: (c) => c.winterChainsSurvived,
  },
  {
    id: "newBiomeSettlement",
    title: "A new frontier",
    description: "Found a settlement in a biome far from home.",
    target: 1,
    reward: { materials: 40 },
    measure: (c) => (c.settlementInNewBiome ? 1 : 0),
  },
];

const QUEST_BY_ID: Record<QuestId, QuestDef> = Object.fromEntries(
  QUEST_DEFS.map((d) => [d.id, d]),
) as Record<QuestId, QuestDef>;

/** Serialize-safe live state for one quest. Plain data — no functions. */
export interface QuestProgress {
  id: QuestId;
  progress: number;
  target: number;
  done: boolean;
  failed: boolean;
  /** Tick the quest was completed, or null while in progress. */
  completedTick: number | null;
}

/** Fresh quest state for a new run: one in-progress entry per quest. */
export function initQuests(): QuestProgress[] {
  return QUEST_DEFS.map((d) => ({
    id: d.id,
    progress: 0,
    target: d.target,
    done: false,
    failed: false,
    completedTick: null,
  }));
}

/**
 * Advance every still-open quest against the context. Mutates the entries in
 * place (updating progress / done / failed) and returns the defs of any quests
 * that completed on this call, so the caller can grant rewards exactly once.
 */
export function evaluateQuests(entries: QuestProgress[], ctx: QuestContext): QuestDef[] {
  const completed: QuestDef[] = [];
  for (const entry of entries) {
    if (entry.done || entry.failed) continue;
    const def = QUEST_BY_ID[entry.id];
    const value = def.measure(ctx);
    entry.progress = Math.min(value, def.target);
    if (value >= def.target) {
      entry.done = true;
      entry.completedTick = ctx.tick;
      completed.push(def);
    } else if (def.deadline !== undefined && ctx.tick > def.deadline) {
      entry.failed = true;
    }
  }
  return completed;
}
