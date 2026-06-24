import { TRAITS, type Era, type TraitName } from "../sim/index.js";

/** One entry in the UI-tracked era log: the tick the tribe entered `era`. */
export interface EraEntry {
  era: Era;
  startTick: number;
}

/** How many years the tribe spent in a given era. */
export interface EraSpan {
  era: Era;
  years: number;
}

export interface TraitDelta {
  trait: TraitName;
  start: number;
  final: number;
  delta: number;
}

export interface EndSummary {
  eras: EraSpan[];
  traits: TraitDelta[];
  peakPop: number;
  totals: { births: number; deaths: number; interbred: number };
  /** The longest-lived individual ever, or null if none recorded. */
  eldest: { age: number; generation: number } | null;
}

/**
 * Turn the UI's era-entry log into years-per-era. Each era runs until the next
 * entry begins; the final era runs until `endTick`. Pure — no DOM, no sim.
 */
export function eraSpans(log: EraEntry[], endTick: number): EraSpan[] {
  return log.map((entry, i) => {
    const next = i + 1 < log.length ? log[i + 1].startTick : endTick;
    return { era: entry.era, years: Math.max(0, next - entry.startTick) };
  });
}

/** Final-minus-starting trait averages, one row per trait, in canonical order. */
export function traitDeltas(
  start: Record<TraitName, number>,
  final: Record<TraitName, number>,
): TraitDelta[] {
  return TRAITS.map((trait) => ({
    trait,
    start: start[trait],
    final: final[trait],
    delta: final[trait] - start[trait],
  }));
}

/** Build the inner HTML for the end-of-run summary. Pure string assembly. */
export function summaryHTML(s: EndSummary, label: (t: TraitName) => string): string {
  const maxYears = Math.max(1, ...s.eras.map((e) => e.years));
  const eraRows = s.eras
    .map(
      (e) => `<div class="sum-era"><span class="se-name">${e.era}</span>
        <span class="se-bar"><i style="width:${Math.round((e.years / maxYears) * 100)}%"></i></span>
        <span class="se-yrs">${e.years} yr</span></div>`,
    )
    .join("");

  const traitRows = s.traits
    .map((t) => {
      const sign = t.delta > 0.0049 ? "up" : t.delta < -0.0049 ? "down" : "flat";
      const arrow = t.delta > 0 ? "+" : "";
      return `<div class="sum-trait"><span class="st-name">${label(t.trait)}</span>
        <span class="st-val">${t.start.toFixed(2)} → ${t.final.toFixed(2)}
        <b class="${sign}">${arrow}${t.delta.toFixed(2)}</b></span></div>`;
    })
    .join("");

  const eldest = s.eldest
    ? `<span>Eldest <b>${s.eldest.age} yr</b> (gen ${s.eldest.generation})</span>`
    : "";

  return `<div class="sum-stats">
      <span>Peak pop <b>${s.peakPop}</b></span>
      <span>Births <b>${s.totals.births}</b></span>
      <span>Deaths <b>${s.totals.deaths}</b></span>
      <span>Interbred <b>${s.totals.interbred}</b></span>
      ${eldest}
    </div>
    <h4>Era timeline</h4>
    <div class="sum-eras">${eraRows}</div>
    <h4>Trait change — start → final</h4>
    <div class="sum-traits">${traitRows}</div>`;
}
