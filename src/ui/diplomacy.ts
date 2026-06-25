import type { PendingChoice, RivalTribe } from "../sim/index.js";

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
        <div class="rival-rel">
          <span class="rival-rel-bar"><i style="width:${relPct}%"></i></span>
          <span class="rival-rel-v">${r.relations.toFixed(2)}</span>
        </div>
        ${actions}
      </div>`;
    })
    .join("");
}
