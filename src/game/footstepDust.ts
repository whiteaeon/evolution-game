/**
 * Pure footstep-dust decision for the walking chieftain.
 *
 * The walk already bobs the body and ticks a footstep sound for each planted
 * foot, but the feet leave no mark on the ground — a brisk stride and a slow
 * creep read identically clean. This decides whether a planted foot kicks up a
 * little dust and how strong that puff is: it scales the puff with how fast the
 * chieftain is actually moving and suppresses it at a crawl (so gliding to a
 * halt doesn't keep puffing), and alternates which side of the feet the dust
 * lands on so left and right steps don't stack on the same spot. Kept Phaser-free
 * so the easing is unit-testable; the scene owns the actual dot and feeds it this.
 */

/** Lateral offset (px) of the puff from the feet — flips side each planted foot. */
export const FOOT_SPREAD = 3;

/** Below this speed (px/sec) a planted foot raises no dust — a quiet glide-out. */
export const FOOT_MIN_SPEED = 45;

/** Opacity of a puff kicked up at full stride. */
export const FOOT_MAX_ALPHA = 0.7;

export interface FootstepDust {
  /** Whether this planted foot kicks up any dust (suppressed at a crawl). */
  emit: boolean;
  /** Lateral offset from the feet (px) — alternates left/right by step parity. */
  offsetX: number;
  /** Puff opacity, ramped 0→max across the walking-speed range above the floor. */
  alpha: number;
}

/**
 * The dust a planted foot kicks up at `stepIdx` while moving at `speed`.
 *
 * Below `minSpeed` no dust rises (`emit` false). Above it the puff's opacity
 * ramps from nothing at the threshold to `maxAlpha` at `topSpeed`, so a brisk
 * stride visibly kicks more dust than a slow shuffle. The lateral offset flips
 * sign each step so consecutive footfalls land to either side of the feet.
 */
export function footstepDust(
  stepIdx: number,
  speed: number,
  topSpeed: number,
  spread: number = FOOT_SPREAD,
  minSpeed: number = FOOT_MIN_SPEED,
  maxAlpha: number = FOOT_MAX_ALPHA,
): FootstepDust {
  if (topSpeed <= 0 || speed <= minSpeed) return { emit: false, offsetX: 0, alpha: 0 };
  const t = Math.min(1, (speed - minSpeed) / (topSpeed - minSpeed));
  const offsetX = (stepIdx & 1) === 0 ? spread : -spread;
  return { emit: true, offsetX, alpha: maxAlpha * t };
}
