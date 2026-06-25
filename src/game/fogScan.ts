/**
 * Pure gate for the fog-of-war reveal scan.
 *
 * Fog uncovers purely as a function of the player's position, so once a
 * stationary player's surroundings are lifted the per-frame window scan reveals
 * nothing new — yet it keeps running while the player gathers at a node, reads a
 * dialog, or simply idles. This decides when the scan is worth running: skip it
 * once the whole map is lifted, or whenever the player hasn't moved since the
 * last scan. Kept Phaser-free so the gate is unit-testable.
 */

/**
 * Whether `revealFog` should scan this frame. False once `fogRemaining` hits 0
 * (the map is fully lifted) or when the player is at exactly the position scanned
 * last (`lastX`/`lastY`) — a stationary window can't reveal a new cell. A sentinel
 * `NaN` last-position (no scan yet) compares unequal, so the first scan always runs.
 */
export function shouldScanFog(
  fogRemaining: number,
  px: number,
  py: number,
  lastX: number,
  lastY: number,
): boolean {
  if (fogRemaining <= 0) return false;
  return px !== lastX || py !== lastY;
}
