import type { TechEffects } from "./types.js";

/**
 * Standing tribe policies: a small set of governing choices, each a single axis
 * with two opposed stances and a neutral default. A stance is a genuine trade-off
 * — it pulls one lever up only by giving ground on another. Like the belief track,
 * a stance's gameplay impact is data: a {@link TechEffects} bundle folded into the
 * same effects the tech tree builds (see {@link Policies.foldInto}), plus a single
 * fitness-pressure scalar that sharpens or flattens individual selection. The
 * all-balanced default contributes nothing, so a run that never sets a policy is
 * unchanged.
 */
export interface PolicyStance {
  id: string;
  name: string;
  blurb: string;
  /** Cohesion/production bonus, aggregated like a tech's {@link TechEffects}. */
  effects: TechEffects;
  /**
   * Multiplier on the fitness exponent in parent selection: >1 sharpens individual
   * selection (the able breed truer), <1 flattens it (the weak are carried). 1 is
   * neutral.
   */
  selectionPressure: number;
}

export interface PolicyAxis {
  id: string;
  name: string;
  blurb: string;
  /** stances[0] is always the balanced default: neutral effects, pressure 1. */
  stances: PolicyStance[];
}

/** The governing axes. Each is mutually exclusive; the player sets one stance each. */
export const POLICY_AXES: PolicyAxis[] = [
  {
    id: "social",
    name: "Social order",
    blurb: "How the tribe balances the group against the individual.",
    stances: [
      {
        id: "balanced", name: "Balanced",
        blurb: "No standing custom — neither communal nor competitive.",
        effects: {}, selectionPressure: 1,
      },
      {
        id: "communal", name: "Communal",
        blurb: "Pool knowledge and labour — shared learning speeds research, but no one strives for themselves, so individual output dips (and selection is gentler).",
        effects: { researchMult: 1.1, foodMult: 0.95 }, selectionPressure: 0.85,
      },
      {
        id: "competitive", name: "Competitive",
        blurb: "Let the able strive — individual drive lifts output and sharpens selection, but shared learning suffers.",
        effects: { researchMult: 0.9, foodMult: 1.05 }, selectionPressure: 1.3,
      },
    ],
  },
  {
    id: "settlement",
    name: "Settlement",
    blurb: "How the tribe weighs growth against security.",
    stances: [
      {
        id: "balanced", name: "Balanced",
        blurb: "No standing custom — neither expansionist nor consolidating.",
        effects: {}, selectionPressure: 1,
      },
      {
        id: "expansion", name: "Expansion",
        blurb: "Spread out and grow — carrying capacity rises, but the scattered camp is harder to defend.",
        effects: { capacityBonus: 5, defenseMult: 1.08 }, selectionPressure: 1,
      },
      {
        id: "consolidation", name: "Consolidation",
        blurb: "Draw in and fortify — the camp stands firmer against raid and beast, but supports fewer mouths.",
        effects: { capacityBonus: -3, defenseMult: 0.9 }, selectionPressure: 1,
      },
    ],
  },
];

/** A neutral effects bundle: multiplicative fields at 1, additive at 0. */
function neutralEffects(): Required<TechEffects> {
  return {
    gatherMult: 1, huntMult: 1, foodMult: 1, buildMult: 1, researchMult: 1, birthMult: 1,
    defenseMult: 1, diseaseDefense: 0, warmth: 0, capacityBonus: 0, intelPressure: 0, abundance: 0,
  };
}

/** The player's standing policy stances, tribe-wide like Knowledge / Culture. */
export class Policies {
  /** axisId → chosen stanceId; defaults to each axis's balanced stance. */
  selected: Record<string, string> = {};

  constructor() {
    for (const axis of POLICY_AXES) this.selected[axis.id] = axis.stances[0].id;
  }

  /** Adopt a stance on an axis. Unknown axis or stance ids are ignored. */
  set(axisId: string, stanceId: string): void {
    const axis = POLICY_AXES.find((a) => a.id === axisId);
    if (!axis || !axis.stances.some((s) => s.id === stanceId)) return;
    this.selected[axisId] = stanceId;
  }

  /** The stance in force on an axis (its balanced default if unset/unknown). */
  stanceOf(axisId: string): PolicyStance {
    const axis = POLICY_AXES.find((a) => a.id === axisId);
    if (!axis) return POLICY_AXES[0].stances[0];
    const id = this.selected[axisId] ?? axis.stances[0].id;
    return axis.stances.find((s) => s.id === id) ?? axis.stances[0];
  }

  /** The stance in force on every axis, in axis order. */
  stances(): PolicyStance[] {
    return POLICY_AXES.map((a) => this.stanceOf(a.id));
  }

  /** Non-default stances the player has actually adopted (for UI / inspection). */
  active(): PolicyStance[] {
    return POLICY_AXES.flatMap((a) => {
      const s = this.stanceOf(a.id);
      return s.id === a.stances[0].id ? [] : [s];
    });
  }

  /**
   * Product of every chosen stance's selection pressure. >1 sharpens individual
   * fitness selection, <1 flattens it; 1 (the all-balanced default) is neutral, so
   * default selection is left exactly as the simulation already computes it.
   */
  selectionPressure(): number {
    let p = 1;
    for (const s of this.stances()) p *= s.selectionPressure;
    return p;
  }

  /**
   * Fold every chosen stance's effects into an existing effects bundle, using the
   * same generic aggregation the tech tree and belief track use (mults multiply,
   * fractions/adds compound). The balanced default's empty bundle is a no-op.
   */
  foldInto(e: Required<TechEffects>): void {
    for (const stance of this.stances()) {
      const fx = stance.effects;
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

  /** The policies' effects on their own (neutral bundle + every chosen stance). */
  aggregateEffects(): Required<TechEffects> {
    const e = neutralEffects();
    this.foldInto(e);
    return e;
  }

  serialize(): { selected: Record<string, string> } {
    return { selected: { ...this.selected } };
  }

  static deserialize(data: { selected?: Record<string, string> } | undefined): Policies {
    const p = new Policies();
    if (data?.selected) {
      for (const [axis, stance] of Object.entries(data.selected)) p.set(axis, stance);
    }
    return p;
  }
}
