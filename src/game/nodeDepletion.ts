/**
 * Pure mapping from a harvestable node's remaining yield to a render scale.
 *
 * A tree/bush/rock looks identical from full to its last swing, so the player
 * gets no read on how picked-over a node is until it suddenly wilts away. This
 * shrinks the sprite a little for each harvest — full nodes stand at scale 1 and
 * a node down to its last unit sits at `minScale` — so depletion is legible at a
 * glance. Kept Phaser-free so the curve is unit-testable.
 */

/**
 * Scale factor (in `[minScale, 1]`) for a node with `remaining` of `initial`
 * units left. Returns 1 for a full or as-yet-untouched node and lerps linearly
 * down toward `minScale` as it empties. Degenerate inputs (initial <= 0, or
 * remaining >= initial) clamp to a full 1.
 */
export function depletionScale(remaining: number, initial: number, minScale = 0.7): number {
  if (initial <= 0) return 1;
  const frac = remaining / initial;
  if (frac >= 1) return 1;
  if (frac <= 0) return minScale;
  return minScale + (1 - minScale) * frac;
}
