/**
 * Per-frame alpha for one warm night light (a campfire/window glow), or `null`
 * when the light should be skipped this frame.
 *
 * `visible` is the off-screen cull: a light whose glow lies outside the camera
 * view isn't rendered, so there's no point paying for its `setAlpha` — we return
 * `null` and the caller leaves it untouched until it scrolls back into view.
 *
 * When visible, the alpha is the light's `max` scaled by how deep into `night`
 * it is (0 at noon → 1 at midnight); fire lights additionally ride the shared
 * `flicker` so they breathe, while steady lights ignore it.
 */
export function nightGlowAlpha(
  visible: boolean,
  max: number,
  night: number,
  fire: boolean,
  flicker: number,
): number | null {
  if (!visible) return null;
  return max * night * (fire ? flicker : 1);
}
