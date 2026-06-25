import { type BeliefStage } from "../sim/index.js";

/**
 * Summarise a belief stage's tribe-wide cohesion bonus as a short, player-facing
 * string, e.g. "+5% defense, +2% births". The belief stages carry their effects
 * as a {@link TechEffects} bundle (see culture.ts); this turns the multipliers a
 * stage actually deviates into readable percentages, in a stable display order.
 * Pure string assembly — no DOM, no sim reads beyond its argument — so the
 * WorldScene HUD and these unit tests share one source of truth.
 *
 * Multipliers where >1 is the boon (births, research) read as "+N%"; defense is
 * inverted (a lower defenseMult means better defended) so it reads as "+N%" too.
 */
export function beliefEffectLabel(stage: BeliefStage): string {
  const fx = stage.effects;
  const parts: string[] = [];
  if (fx.defenseMult && fx.defenseMult !== 1) parts.push(`+${pctDown(fx.defenseMult)}% defense`);
  if (fx.researchMult && fx.researchMult !== 1) parts.push(`+${pctUp(fx.researchMult)}% research`);
  if (fx.birthMult && fx.birthMult !== 1) parts.push(`+${pctUp(fx.birthMult)}% births`);
  return parts.join(", ");
}

/** Percent a >1 multiplier raises a lever by, e.g. 1.06 → 6. */
function pctUp(mult: number): number {
  return Math.round((mult - 1) * 100);
}

/** Percent a <1 multiplier improves an inverted lever (defense) by, e.g. 0.95 → 5. */
function pctDown(mult: number): number {
  return Math.round((1 - mult) * 100);
}
