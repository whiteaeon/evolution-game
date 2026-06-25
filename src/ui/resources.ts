import type { GatheredResource } from "../sim/index.js";

/** Smoothed per-year production for each carryable raw resource. */
export interface ResourceProduction {
  wood: number;
  stone: number;
  hide: number;
}

/**
 * An active gate: something the tribe is researching/building that is parked
 * waiting on raw resources still missing from the stockpile.
 */
export interface ResourceGate {
  /** What the gate is for, e.g. the tech being researched. */
  label: string;
  /** Outstanding amount still required, per resource. */
  needs: { resource: GatheredResource; amount: number }[];
}

/** Everything the resources panel draws, read purely from sim state by the overlay. */
export interface ResourceView {
  food: number;
  wood: number;
  stone: number;
  hide: number;
  prod: ResourceProduction;
  shelter: string;
  regionName: string;
  biome: string;
  cooking: boolean;
  gate: ResourceGate | null;
}

const ICON: Record<GatheredResource, string> = { wood: "🪵", stone: "🪨", hide: "🟫" };
const NAME: Record<GatheredResource, string> = { wood: "Wood", stone: "Stone", hide: "Hide" };

/** A single raw-resource stock, with its production rate when it is actually flowing. */
function stockHTML(res: GatheredResource, stock: number, rate: number): string {
  const prod = rate > 0.05 ? ` <span class="prod">+${rate.toFixed(1)}/yr</span>` : "";
  return `${ICON[res]} ${NAME[res]} <b>${Math.floor(stock)}</b>${prod}`;
}

/**
 * Build the resources panel: food and the carryable stocks (wood/stone/hide) with
 * their production, the shelter/region/cooking summary, and — when research is
 * stalled for want of raw materials — a gate line spelling out what is missing.
 * Pure string assembly; no DOM and no sim reads beyond its argument.
 */
export function resourcesPanelHTML(v: ResourceView): string {
  const summary = [
    `🍖 Food <b>${Math.floor(v.food)}</b>`,
    stockHTML("wood", v.wood, v.prod.wood),
    stockHTML("stone", v.stone, v.prod.stone),
    stockHTML("hide", v.hide, v.prod.hide),
    `🏠 ${cap(v.shelter)}`,
    `🗺 ${v.regionName} <span class="dim2">(${v.biome})</span>`,
    v.cooking ? `<span class="cooking">cooking ✓</span>` : "",
  ]
    .filter(Boolean)
    .join("<span class='sep'>·</span>");
  const gate = v.gate
    ? `<div class="resgate">⛔ ${v.gate.label} needs ${v.gate.needs
        .map((n) => `${n.amount} ${NAME[n.resource]} ${ICON[n.resource]}`)
        .join(", ")}</div>`
    : "";
  return summary + gate;
}

const cap = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
