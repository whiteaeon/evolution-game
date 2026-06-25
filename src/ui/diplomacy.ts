import { ERAS, type PendingChoice, type RivalTribe } from "../sim/index.js";

/** How a rival's disposition toward the player is shown: colour + icon + label. */
export interface DispositionStyle {
  key: "hostile" | "wary" | "neutral" | "cordial" | "friendly";
  label: string;
  /** Marker colour on the map and the disposition glyph in the panel. */
  color: string;
  icon: string;
}

const HOSTILE: DispositionStyle = { key: "hostile", label: "Hostile", color: "#e0705f", icon: "⚔" };
const WARY: DispositionStyle = { key: "wary", label: "Wary", color: "#e0922f", icon: "⚠" };
const NEUTRAL: DispositionStyle = { key: "neutral", label: "Neutral", color: "#c7c06a", icon: "•" };
const CORDIAL: DispositionStyle = { key: "cordial", label: "Cordial", color: "#a9cf6a", icon: "🤝" };
const FRIENDLY: DispositionStyle = { key: "friendly", label: "Friendly", color: "#8fcf6a", icon: "☺" };

/** Bucket a disposition in [-1, 1] into a display style (colour + icon). */
export function dispositionStyle(disposition: number): DispositionStyle {
  if (disposition <= -0.5) return HOSTILE;
  if (disposition < -0.15) return WARY;
  if (disposition <= 0.15) return NEUTRAL;
  if (disposition < 0.5) return CORDIAL;
  return FRIENDLY;
}

/**
 * Format one rival tribe as a two-line entry for the in-world Neighbours roster:
 * its disposition glyph, name, home region and biome, then its era (with how far
 * it has crept toward the next one, unless already in the final era), numbers,
 * martial might, mood and the relations the player has built. Pure string
 * assembly — no DOM, no sim reads beyond its arguments — so the WorldScene panel
 * and these unit tests share exactly one source of truth.
 */
export function neighbourRosterLine(
  r: RivalTribe,
  regionName: (id: string) => string,
): string {
  const disp = dispositionStyle(r.disposition);
  // Surface techProgress — the rival's [0,1) creep toward its next era — so a
  // player can read which neighbour is about to advance (and grow as a threat),
  // not just where it sits now. Omitted in the final era, where there is no next.
  const atFinalEra = r.eraIndex >= ERAS.length - 1;
  const era = atFinalEra
    ? ERAS[r.eraIndex]
    : `${ERAS[r.eraIndex]} (→ next ${Math.round(r.techProgress * 100)}%)`;
  return (
    `${disp.icon} ${r.name} · ${regionName(r.homeRegion)} (${r.biome})\n` +
    `   ${era} · 👥 ${Math.round(r.population)} · might ${Math.round(r.strength * 100)}%` +
    ` · ${disp.label} · relations ${r.relations.toFixed(2)}`
  );
}

/**
 * Build the inner HTML for the Neighbours panel: one row per rival tribe with its
 * disposition (colour + icon), home region, and the relations the player has
 * built. When the sim has an open diplomacy offer from that tribe (a pending
 * choice carrying its `rivalId`), the two responses render as buttons wired to
 * the `diplo-0`/`diplo-1` actions the overlay routes to `resolveChoice`. Pure
 * string assembly — no DOM, no sim reads beyond its arguments.
 */
export function diplomacyPanelHTML(
  rivals: RivalTribe[],
  regionName: (id: string) => string,
  pending: PendingChoice | null,
): string {
  if (rivals.length === 0)
    return `<div class="rival-empty">No neighbours share your world.</div>`;
  return rivals
    .map((r) => {
      const disp = dispositionStyle(r.disposition);
      const relPct = Math.round(((r.relations + 1) / 2) * 100);
      const offer = pending && pending.rivalId === r.id ? pending : null;
      const actions = offer
        ? `<div class="rival-offer"><span class="rival-offer-t">${offer.title}</span>
            <div class="rival-actions">
              <button data-act="diplo-0" class="primary">${offer.options[0].label}</button>
              <button data-act="diplo-1">${offer.options[1].label}</button>
            </div></div>`
        : "";
      return `<div class="rival" data-rival="${r.id}">
        <div class="rival-h">
          <span class="rival-disp" data-disp="${disp.key}" style="color:${disp.color}" role="img" aria-label="${disp.label}" title="${disp.label}">${disp.icon}</span>
          <span class="rival-name">${r.name}</span>
          <span class="rival-where">${regionName(r.homeRegion)}</span>
        </div>
        <div class="rival-rel" title="Relations — the standing you've built through diplomacy, from −1 to +1">
          <span class="rival-rel-bar"><i style="width:${relPct}%"></i></span>
          <span class="rival-rel-v">${r.relations.toFixed(2)}</span>
        </div>
        ${actions}
      </div>`;
    })
    .join("");
}
