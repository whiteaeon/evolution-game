import type { TechEffects } from "./types.js";

/**
 * The belief track — a small progression that runs parallel to the tech tree's
 * language chain. Where language climbs gestures→writing, culture accrues from
 * rituals, burial and art, and as it crosses each threshold the tribe reaches a
 * new belief stage. Each stage grants a small, data-driven cohesion bonus,
 * aggregated generically exactly like {@link TechEffects} — no per-stage code in
 * the simulation, just data folded into the same effects bundle the tech tree
 * produces (see {@link Culture.foldInto}).
 */
export interface BeliefStage {
  id: string;
  name: string;
  /** Cumulative culture points needed to reach this stage. */
  threshold: number;
  /** Cohesion bonus, aggregated like a tech's {@link TechEffects}. */
  effects: TechEffects;
  blurb: string;
}

/** Ordered by threshold. A tribe is "at" the highest stage it has reached. */
export const BELIEF_STAGES: BeliefStage[] = [
  {
    id: "ancestorRites", name: "Ancestor Rites", threshold: 50,
    effects: { birthMult: 1.04 },
    blurb: "To honour the dead is to bind the living — kin hold a little closer.",
  },
  {
    id: "totems", name: "Totems & Spirits", threshold: 150,
    effects: { defenseMult: 0.95, birthMult: 1.02 },
    blurb: "Carved guardians watch the camp; the tribe stands a little firmer.",
  },
  {
    id: "shamanism", name: "Shamanism", threshold: 320,
    effects: { researchMult: 1.06, birthMult: 1.03 },
    blurb: "Seers read meaning into the world — shared lore passes more freely.",
  },
  {
    id: "organizedReligion", name: "Organized Religion", threshold: 600,
    effects: { researchMult: 1.05, defenseMult: 0.94, birthMult: 1.04 },
    blurb: "A common faith orders the people; cohesion becomes a force of its own.",
  },
];

/** A neutral effects bundle: multiplicative fields at 1, additive at 0. */
function neutralEffects(): Required<TechEffects> {
  return {
    gatherMult: 1, huntMult: 1, foodMult: 1, buildMult: 1, researchMult: 1, birthMult: 1,
    defenseMult: 1, diseaseDefense: 0, warmth: 0, capacityBonus: 0, intelPressure: 0, abundance: 0,
  };
}

/** Cumulative belief, accrued from rituals/burial/art. Tribe-wide, like Knowledge. */
export class Culture {
  points = 0;

  /** Add culture points (rituals, or the passive draw of cultural techs). */
  accrue(amount: number): void {
    if (amount > 0) this.points += amount;
  }

  /** How many belief stages the accrued culture has reached (0..N). */
  level(): number {
    let n = 0;
    for (const s of BELIEF_STAGES) if (this.points >= s.threshold) n++;
    return n;
  }

  /** The highest belief stage reached, or null before the first. */
  stage(): BeliefStage | null {
    let reached: BeliefStage | null = null;
    for (const s of BELIEF_STAGES) if (this.points >= s.threshold) reached = s;
    return reached;
  }

  /**
   * Fold every reached stage's effects into an existing effects bundle, using the
   * same aggregation rules the tech tree uses (mults multiply, fractions/adds
   * compound). Lets the simulation merge belief cohesion straight into the bundle
   * it already builds from {@link Knowledge.aggregateEffects}.
   */
  foldInto(e: Required<TechEffects>): void {
    for (const s of BELIEF_STAGES) {
      if (this.points < s.threshold) continue;
      const fx = s.effects;
      if (fx.gatherMult) e.gatherMult *= fx.gatherMult;
      if (fx.huntMult) e.huntMult *= fx.huntMult;
      if (fx.foodMult) e.foodMult *= fx.foodMult;
      if (fx.buildMult) e.buildMult *= fx.buildMult;
      if (fx.researchMult) e.researchMult *= fx.researchMult;
      if (fx.birthMult) e.birthMult *= fx.birthMult;
      if (fx.defenseMult) e.defenseMult *= fx.defenseMult;
      if (fx.diseaseDefense) e.diseaseDefense = 1 - (1 - e.diseaseDefense) * (1 - fx.diseaseDefense);
      if (fx.warmth) e.warmth += fx.warmth;
      if (fx.capacityBonus) e.capacityBonus += fx.capacityBonus;
      if (fx.intelPressure) e.intelPressure += fx.intelPressure;
      if (fx.abundance) e.abundance += fx.abundance;
    }
  }

  /** The belief track's effects on their own (neutral bundle + every reached stage). */
  aggregateEffects(): Required<TechEffects> {
    const e = neutralEffects();
    this.foldInto(e);
    return e;
  }

  serialize(): { points: number } {
    return { points: this.points };
  }

  static deserialize(data: { points: number } | undefined): Culture {
    const c = new Culture();
    c.points = data?.points ?? 0;
    return c;
  }
}
