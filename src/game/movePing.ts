/**
 * Pure visual state for the click-to-move destination ping.
 *
 * Clicking the ground sets a walk-to target, but with no marker the player has
 * no confirmation of *where* they ordered the chieftain to go. This drives a
 * brief RTS-style ping at the click point: a stroked ring that expands outward
 * and fades over a fixed lifetime, independent of when the chieftain arrives.
 * Kept Phaser-free so the easing can be unit-tested without a canvas; the scene
 * owns the actual ring object and feeds it this state each frame.
 */

export interface PingStyle {
  /** Ring scale — grows from a tight dot to a wide ripple. */
  scale: number;
  /** Ring opacity — fades to nothing as it expands. */
  alpha: number;
  /** True once the ping has lived out its lifetime and should be hidden. */
  done: boolean;
}

/**
 * The ping's look at `ageMs` into a `durationMs` lifetime. The ring expands
 * (scale 0.6 → 1.5) while its opacity fades (1 → 0), so a click reads as a
 * single outward ripple that settles on its own. Age is clamped, so calling
 * past the lifetime is harmless and simply reports `done`.
 */
export function movePingStyle(ageMs: number, durationMs: number): PingStyle {
  const t = Math.max(0, Math.min(1, ageMs / durationMs));
  return {
    scale: 0.6 + t * 0.9,
    alpha: 1 - t,
    done: ageMs >= durationMs,
  };
}
