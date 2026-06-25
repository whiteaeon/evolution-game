/**
 * Pure facing decision for harvesting in place.
 *
 * The chieftain's flip is normally set by the travel direction while walking,
 * but a player who stops beside a node and holds Space keeps whatever way they
 * last faced — so they can stand swinging at a tree that's plainly to their
 * other side. This turns them to face the aimed node when they harvest in place
 * (villagers already face their work node; this gives the player the same).
 * A small deadzone around dead-centre avoids flicker for near-aligned nodes.
 *
 * Returns true to face left (flipX), false to face right, or null to keep the
 * current facing (node too near centred to decide). Kept Phaser-free so it's
 * unit-testable.
 */
export function gatherFacing(playerX: number, nodeX: number, deadzone: number): boolean | null {
  const dx = nodeX - playerX;
  if (Math.abs(dx) <= deadzone) return null;
  return dx < 0;
}
