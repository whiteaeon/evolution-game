/**
 * Pure stall detection for click-to-move.
 *
 * A walk order completes when the chieftain gets within a few pixels of the
 * clicked destination. But a click can land somewhere the chieftain can never
 * reach — inside a tree, rock or other solid — and then the arrival check never
 * fires: the obstacle-avoidance routing just orbits the blocker forever, leaving
 * the player shuffling in place against it. This tracks how long an approach has
 * gone without getting any closer, so WorldScene can abandon an unreachable
 * destination instead of grinding on it. Kept Phaser-free so it's unit-testable.
 */

/**
 * How long (ms) the chieftain may fail to get closer to a click destination
 * before the order is abandoned. Long enough that a genuine slow final approach
 * still lands; short enough that orbiting a blocker reads as a quick give-up.
 */
export const MOVE_STALL_MS = 750;

/**
 * Progress (px) that counts as "still getting there", resetting the stall timer.
 * A normal approach closes the gap by more than this each frame; an orbit around
 * an obstacle never beats its closest pass by this margin.
 */
export const MOVE_PROGRESS_EPS = 0.5;

export interface StallTracker {
  /** Closest the mover has come to the destination so far. */
  bestDist: number;
  /** Time (ms) spent since last beating {@link bestDist} by the epsilon. */
  stalledMs: number;
}

/** A fresh tracker seeded at the start of an approach `dist` px from the goal. */
export function freshStall(dist: number): StallTracker {
  return { bestDist: dist, stalledMs: 0 };
}

/**
 * Advance the tracker by one frame.
 *
 * Real progress (closing the gap by more than `eps`) resets the timer; anything
 * less accumulates it. Once the mover has gone `stallMs` without progress the
 * approach is hopeless and `giveUp` is set.
 */
export function stepStall(
  t: StallTracker,
  dist: number,
  dt: number,
  stallMs: number = MOVE_STALL_MS,
  eps: number = MOVE_PROGRESS_EPS,
): { tracker: StallTracker; giveUp: boolean } {
  if (dist < t.bestDist - eps) {
    return { tracker: { bestDist: dist, stalledMs: 0 }, giveUp: false };
  }
  const stalledMs = t.stalledMs + dt;
  const bestDist = Math.min(t.bestDist, dist);
  return { tracker: { bestDist, stalledMs }, giveUp: stalledMs >= stallMs };
}
