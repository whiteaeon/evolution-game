/** A rectangle in world coordinates (matches Phaser's `Camera.worldView` shape). */
export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * True when the world point `(px, py)` lies inside `view`, expanded by `margin`
 * on every side. Used to skip spawning purely decorative particles/floaters for
 * events that happen off-screen (e.g. a raid resolving at camp while the player
 * has wandered away) so no sprites or tweens are created for them.
 */
export function isPointVisible(
  px: number,
  py: number,
  view: ViewRect,
  margin = 0,
): boolean {
  return (
    px >= view.x - margin &&
    px <= view.x + view.width + margin &&
    py >= view.y - margin &&
    py <= view.y + view.height + margin
  );
}
