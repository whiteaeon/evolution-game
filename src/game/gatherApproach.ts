/**
 * Pure geometry for "click a node to walk up and gather it".
 *
 * A gatherable node is a solid blocker, so a click that lands on it can't be a
 * move destination — the chieftain would bump the blocker and stall just shy of
 * it. Instead we aim for a point a short reach `stop` out from the node, along
 * the line back toward the player, so the walk ends with the node in gather
 * range. Kept Phaser-free so the targeting is unit-testable.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * The point to walk to so a node ends up within gather reach.
 *
 * Returns a point `stop` px out from `node` toward `from`. If the player is
 * already within `stop` of the node, returns null — they're in range, so no
 * walk is needed. If the player sits exactly on the node (degenerate, zero
 * distance), the node is by definition in range, so this also returns null.
 */
export function gatherApproach(from: Point, node: Point, stop: number): Point | null {
  const dx = from.x - node.x;
  const dy = from.y - node.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= stop) return null; // already in range — nothing to walk toward
  return { x: node.x + (dx / dist) * stop, y: node.y + (dy / dist) * stop };
}
