import { isUnlocked, type CodexCategory, type CodexContext, type CodexEntry } from "../sim/index.js";

const GROUPS: { category: CodexCategory; label: string }[] = [
  { category: "tech", label: "Technologies" },
  { category: "biome", label: "Biomes" },
  { category: "lineage", label: "Lineages" },
  { category: "event", label: "Events" },
];

/**
 * Build the inner HTML for the codex panel: the entries discovered so far,
 * grouped by category, each with its title and flavour text. Locked (undiscovered)
 * entries are omitted — the codex lists what the tribe has actually met. Pure
 * string assembly: no DOM, no sim reads beyond its arguments.
 */
export function codexHTML(entries: CodexEntry[], ctx: CodexContext): string {
  return GROUPS.map(({ category, label }) => {
    const found = entries.filter((e) => e.category === category && isUnlocked(e, ctx));
    if (found.length === 0) return "";
    const rows = found
      .map(
        (e) => `<div class="codex-entry"><div class="codex-t">${e.title}</div>
          <div class="codex-l">${e.lore}</div></div>`,
      )
      .join("");
    return `<div class="codex-group"><div class="codex-gh">${label} <span class="dim">(${found.length})</span></div>${rows}</div>`;
  }).join("");
}
