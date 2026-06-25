import { type Individual } from "./types.js";

/**
 * Leaders / chieftains: each tribe has a leader — a notable living individual
 * whose standout trait grants a small, tribe-wide bonus. Pure helpers over the
 * individuals array (no RNG, no DOM, no Phaser), mirroring naming.ts: selection
 * and the trait-driven bonus are deterministic functions the simulation drives.
 */

/** The governing traits a leader can lead by, each tied to one tribe-wide lever. */
export const LEADER_TRAITS = ["strength", "intelligence", "speech"] as const;
export type LeaderTrait = (typeof LEADER_TRAITS)[number];

/** Flavour epithet for the chronicle, one per governing trait. */
export const LEADER_STYLE: Record<LeaderTrait, string> = {
  strength: "the Warleader",
  intelligence: "the Sage",
  speech: "the Speaker",
};

/** Max fraction a perfect (1.0) trait contributes; the bonus scales linearly with the trait. */
export const LEADER_BONUS_SCALE = 0.1;

export interface LeaderBonus {
  /** The dominant governing trait this leader leads by. */
  trait: LeaderTrait;
  /** Flavour epithet for the chronicle. */
  style: string;
  /** Multiply onto effects.defenseMult — <1 means better defended (a strong leader). */
  defenseMult: number;
  /** Multiply onto effects.researchMult — >1 speeds research (a smart leader). */
  researchMult: number;
  /** Multiply onto effects.foodMult — >1 as the tribe forages as one (a speechful leader). */
  foodMult: number;
}

/** The trait a leader leads by: their strongest of the three (ties by LEADER_TRAITS order). */
export function leaderTrait(leader: Individual): LeaderTrait {
  let best: LeaderTrait = LEADER_TRAITS[0];
  for (const t of LEADER_TRAITS) {
    if (leader.genome[t] > leader.genome[best]) best = t;
  }
  return best;
}

/**
 * The tribe-wide bonus a leader grants, driven by their dominant governing trait
 * and scaled by how high that trait is. Only the dominant trait's lever deviates
 * from neutral (the other two stay 1, i.e. no effect): a strong leader hardens
 * defense, a smart one speeds research, a speechful one boosts cooperative food.
 */
export function leaderBonus(leader: Individual): LeaderBonus {
  const trait = leaderTrait(leader);
  const mag = leader.genome[trait] * LEADER_BONUS_SCALE;
  return {
    trait,
    style: LEADER_STYLE[trait],
    defenseMult: trait === "strength" ? 1 - mag : 1,
    researchMult: trait === "intelligence" ? 1 + mag : 1,
    foodMult: trait === "speech" ? 1 + mag : 1,
  };
}

/**
 * Pick the tribe's leader from the given candidates: the individual with the
 * highest combined governing-trait score (strength + intelligence + speech).
 * Ties break by lowest id for determinism. Returns null for an empty list. The
 * caller decides who is eligible (e.g. living adults).
 */
export function selectLeader(candidates: Individual[]): number | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestScore = leadershipScore(best);
  for (const c of candidates) {
    const score = leadershipScore(c);
    if (score > bestScore || (score === bestScore && c.id < best.id)) {
      best = c;
      bestScore = score;
    }
  }
  return best.id;
}

function leadershipScore(ind: Individual): number {
  let s = 0;
  for (const t of LEADER_TRAITS) s += ind.genome[t];
  return s;
}
