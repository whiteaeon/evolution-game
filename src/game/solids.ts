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
