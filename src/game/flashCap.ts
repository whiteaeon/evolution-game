/**
 * How many of the oldest live flash notices to retire when a new one arrives, so
 * a burst of events — a birth, a loss and an outbreak in one beat, or a flurry of
 * building placements — can't pile up unbounded overlapping text + tweens at the
 * same screen spot. Keeps at most `cap` alive *including* the incoming notice.
 *
 * Mirrors the scene's particle cap: the renderer owns the actual text + tween
 * lifecycle; this just decides how many to evict from the front (oldest first).
 * Returns 0 while there is still room under the cap.
 */
export function flashEvictCount(active: number, cap: number): number {
  return Math.max(0, active - cap + 1);
}
