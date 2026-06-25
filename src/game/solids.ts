/**
 * A circular collision blocker in world space. Trees, rocks, huts and totems all
 * register one so the player can't walk through them. Kept Phaser-free so the
 * bookkeeping is unit-testable.
 */
export interface Solid {
  x: number;
  y: number;
  r: number;
}

/**
 * Drop one solid (by reference) from the collision set, returning a new array.
 * Used when a harvestable node depletes: its sprite is destroyed, so its blocker
 * must go too — otherwise the player keeps colliding with an invisible stump and
 * the solids list grows unbounded over a long session. A null/absent solid is a
 * no-op (returns an equivalent array), so callers needn't guard.
 */
export function removeSolid(solids: Solid[], solid: Solid | undefined): Solid[] {
  if (!solid) return solids.slice();
  return solids.filter((s) => s !== solid);
}

/**
 * True when a body of radius `bodyR` centred at `(x, y)` overlaps any solid.
 * The player's movement probes several candidate steps every frame, so the test
 * stays on squared distances — `d < r` iff `d² < r²` for non-negative values —
 * to skip a `sqrt` per solid per probe. Pure (no Phaser) so it stays testable.
 */
export function isBlocked(x: number, y: number, solids: readonly Solid[], bodyR: number): boolean {
  return solids.some((s) => {
    const dx = x - s.x;
    const dy = y - s.y;
    const reach = s.r + bodyR;
    return dx * dx + dy * dy < reach * reach;
  });
}
