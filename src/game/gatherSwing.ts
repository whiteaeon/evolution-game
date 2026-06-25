/**
 * Pure swing-arc easing for the chieftain's body when striking a node in place.
 *
 * Standing over a tree, the player's hold-to-gather lands a hit on a steady
 * cadence, but until now only the *node* squashed — the harvester stood rigid, so
 * each swing read as the resource flinching rather than the chieftain chopping it.
 * This returns a lean angle (degrees) that snaps to a peak on the strike then eases
 * back to rest, so the body telegraphs the blow. Kept Phaser-free so the arc is
 * unit-testable: the scene resets the elapsed time on every harvest, signs the
 * result by the facing direction, and hands it straight to `setAngle`.
 */

/**
 * The lean angle (degrees, always ≥ 0) at `timeMs` into a `durationMs` swing,
 * peaking at `peakDeg`. The arc drives in quickly to the strike point then eases
 * back to rest, squared so the peak and both ends ease rather than snap. Returns
 * 0 outside `[0, durationMs)` so a finished or un-started swing leaves the body
 * upright.
 */
export function gatherSwingAngle(timeMs: number, durationMs: number, peakDeg: number): number {
  if (timeMs < 0 || timeMs >= durationMs) return 0;
  const t = timeMs / durationMs;
  const STRIKE = 0.3; // fraction of the swing spent driving in to the peak
  const arc = t < STRIKE ? t / STRIKE : 1 - (t - STRIKE) / (1 - STRIKE); // 0→1→0
  return peakDeg * arc * arc; // squared: a snappier strike, a softer settle
}
