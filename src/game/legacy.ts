import { ERAS, TRAITS, type Era, type Genome } from "../sim/index.js";

/**
 * Light roguelite meta. A finished run (win or extinction) leaves a "legacy":
 * the best era ever reached and a small heritable head-start for the founders of
 * the next run, drawn from how evolved the gene pool became. Pure helpers here;
 * localStorage IO is at the bottom and kept thin.
 */
export interface Legacy {
  runs: number;
  bestEraIndex: number;
  bonus: Partial<Genome>;
}

export const EMPTY_LEGACY: Legacy = { runs: 0, bestEraIndex: 0, bonus: {} };

/** A modest founder bonus from a finished run's trait averages (capped). */
export function bonusFromRun(traitAverages: Record<string, number>): Partial<Genome> {
  const bonus: Partial<Genome> = {};
  for (const t of TRAITS) {
    const evolved = (traitAverages[t] ?? 0) - 0.4; // how far past the baseline
    bonus[t] = Math.max(0, Math.min(0.06, evolved * 0.15));
  }
  return bonus;
}

/** Fold a new run's result into the stored legacy, keeping the better of each. */
export function foldLegacy(
  prev: Legacy,
  era: Era,
  traitAverages: Record<string, number>,
): Legacy {
  const eraIdx = ERAS.indexOf(era);
  const fresh = bonusFromRun(traitAverages);
  const bonus: Partial<Genome> = {};
  for (const t of TRAITS) bonus[t] = Math.max(prev.bonus[t] ?? 0, fresh[t] ?? 0);
  return {
    runs: prev.runs + 1,
    bestEraIndex: Math.max(prev.bestEraIndex, eraIdx),
    bonus,
  };
}

// ── localStorage IO ──────────────────────────────────────────────────────────

const KEY = "dawn-of-the-tribe-legacy";

export function loadLegacy(): Legacy {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_LEGACY;
    return { ...EMPTY_LEGACY, ...JSON.parse(raw) };
  } catch {
    return EMPTY_LEGACY;
  }
}

export function saveLegacy(legacy: Legacy): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(legacy));
  } catch {
    /* storage unavailable — meta is optional */
  }
}
