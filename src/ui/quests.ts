import type { QuestDef, QuestProgress, QuestReward } from "../sim/index.js";

/** A one-off quest reward formatted for display, e.g. "🍖 20" or "🪵 30". */
export function rewardText(r: QuestReward): string {
  const parts: string[] = [];
  if (r.food) parts.push(`🍖 ${r.food}`);
  if (r.materials) parts.push(`🪵 ${r.materials}`);
  return parts.join(" ");
}

/**
 * Build the inner HTML for the quest log: one row per quest with its title,
 * one-line description, a progress bar and the reward. Done and failed quests
 * are marked. Pure string assembly — no DOM, no sim reads beyond its arguments.
 */
export function questLogHTML(quests: QuestProgress[], defs: QuestDef[]): string {
  const byId = new Map(defs.map((d) => [d.id, d]));
  return quests
    .map((q) => {
      const def = byId.get(q.id);
      if (!def) return "";
      const state = q.done ? "done" : q.failed ? "failed" : "active";
      const pct = q.target > 0 ? Math.round((q.progress / q.target) * 100) : 0;
      const mark = q.done ? "✓ " : q.failed ? "✗ " : "";
      return `<div class="quest ${state}">
        <div class="quest-h"><span class="quest-t">${mark}${def.title}</span>
          <span class="quest-r">${rewardText(def.reward)}</span></div>
        <div class="quest-d">${def.description}</div>
        <span class="qprog" role="progressbar" aria-valuemin="0" aria-valuemax="${q.target}" aria-valuenow="${q.progress}" aria-label="${def.title} progress"><i style="width:${pct}%"></i></span>
        <span class="quest-n">${q.progress}/${q.target}</span></div>`;
    })
    .join("");
}
