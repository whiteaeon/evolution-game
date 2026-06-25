/**
 * How many decorative particles a burst may actually spawn, given a global cap
 * on how many are alive at once. A burst that would push the live count past
 * `cap` is trimmed (or skipped entirely) so pathological spawn rates — rapid
 * building placement, overlapping bursts — can never pile up unbounded sprites
 * and tweens. Returns `clamp(requested, 0, cap - active)`.
 */
export function particleBudget(active: number, requested: number, cap: number): number {
  return Math.max(0, Math.min(requested, cap - active));
}
