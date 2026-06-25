/**
 * Pure arrival-steering for click-to-move.
 *
 * Click-to-move used to drive the chieftain at full speed right up until the
 * destination was within a few pixels, then drop the target and let the velocity
 * tail glide on — so the player visibly overshot and drifted past the click.
 * This eases the *target* speed down inside a slowing radius so the walk settles
 * onto the destination instead of barrelling through it. Kept Phaser-free so the
 * easing is unit-testable; WASD movement is unaffected (it never calls this).
 */

/**
 * Target speed for a mover `dist` px from its destination.
 *
 * Full `maxSpeed` at or beyond `slowRadius`, then scaled linearly down to 0 as
 * the destination is reached, so the approach decelerates smoothly.
 */
export function arrivalSpeed(dist: number, maxSpeed: number, slowRadius: number): number {
  if (slowRadius <= 0) return maxSpeed; // no slowing zone: hold full speed
  if (dist >= slowRadius) return maxSpeed;
  if (dist <= 0) return 0;
  return maxSpeed * (dist / slowRadius);
}
