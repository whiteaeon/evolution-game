/**
 * Pure, Phaser-free quest bookkeeping so the progress maths can be unit-tested
 * without a canvas. WorldScene.ts owns the markers, dialog and the log panel and
 * feeds the running counters in via {@link QuestMetrics}; this module only knows
 * how to read a quest's current progress metric out of that bag of counters.
 */

export type ResKind = "wood" | "food" | "stone";

/** The kinds of task a villager can hand out. */
export type QuestKind = "gather" | "build" | "explore" | "talk" | "harvest";

/** The fixed definition of a quest, before a giver and runtime state attach. */
export interface QuestSpec {
  desc: string;
  kind: QuestKind;
  res?: ResKind; // gather: which resource
  build?: "hut" | "farm"; // build: which structure
  region?: string; // explore: the named area to scout
  target: number;
  reward: { res: ResKind; amount: number };
}

/** Every running counter a quest's progress can be measured against. */
export interface QuestMetrics {
  gathered: Record<ResKind, number>;
  housing: number;
  farmsBuilt: number;
  villagersTalked: number;
  farmHarvests: number;
  /** Fog cells revealed so far within each explore region, keyed by name. */
  regionExplored: Record<string, number>;
}

/**
 * The absolute progress metric for a quest given the current counters. Progress
 * toward the target is this minus the snapshot taken when the quest was accepted
 * (see {@link QuestSpec.target}), so every kind shares one delta rule.
 */
export function questMetric(
  q: Pick<QuestSpec, "kind" | "res" | "build" | "region">,
  m: QuestMetrics,
): number {
  switch (q.kind) {
    case "gather":
      return q.res ? m.gathered[q.res] : 0;
    case "build":
      return q.build === "farm" ? m.farmsBuilt : m.housing;
    case "explore":
      return q.region ? (m.regionExplored[q.region] ?? 0) : 0;
    case "talk":
      return m.villagersTalked;
    case "harvest":
      return m.farmHarvests;
  }
}

/**
 * The one-time banner announced the moment a quest's objective is met (the
 * active→ready transition). Names the task and points the player back to the
 * giver to collect — the cue that previously only surfaced passively through the
 * tracker line and the marker glyph.
 */
export function questReadyBanner(desc: string, giver: string): string {
  return `Objective met: ${desc} — return to ${giver}`;
}
