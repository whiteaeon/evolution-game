import { type Settlement, type Task } from "../sim/index.js";

/**
 * The work tasks shown in a settlement's labour split (idle is omitted — it is
 * the absence of work, not a job). Ordered for a stable, readable readout.
 */
const WORK_TASKS: readonly [Task, string][] = [
  ["gather", "g"],
  ["hunt", "h"],
  ["research", "r"],
  ["cook", "c"],
  ["build", "b"],
];

/** Living members of a settlement (its members array retains the dead). */
export function settlementPopulation(st: Settlement): number {
  return st.members.reduce((n, m) => n + (m.alive ? 1 : 0), 0);
}

/**
 * Format one settlement as a two-line entry for the in-world Settlements roster:
 * its seat (region name + biome), then its living numbers, shelter tier, food
 * larder and how its labour is split across the work tasks. Pure string assembly
 * — no DOM, no sim reads beyond its arguments — so the WorldScene panel and these
 * unit tests share exactly one source of truth.
 */
export function settlementRosterLine(st: Settlement, isHome: boolean): string {
  const tag = isHome ? "home" : "outpost";
  const work = WORK_TASKS.filter(([t]) => st.allocation[t] > 0)
    .map(([t, label]) => `${label}${st.allocation[t]}`)
    .join(" ");
  const split = work || "idle";
  return (
    `🏠 ${st.name} (${st.biome}) · ${tag}\n` +
    `   👥 ${settlementPopulation(st)} · 🛖 ${st.shelter} · 🍖 ${Math.floor(st.resources.food)} · ⚒ ${split}`
  );
}
