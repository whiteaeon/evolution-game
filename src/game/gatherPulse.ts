/**
 * Pure colour pulse for the aimed gather node's highlight.
 *
 * The chieftain auto-aims the nearest harvestable node, but a single static tint
 * is easy to lose in a cluster of trees — the player can't tell at a glance which
 * one Space will actually hit. This breathes the highlight between two warm tones
 * so the aimed node visibly throbs, reading clearly as "this is your target".
 * Kept Phaser-free so the easing is unit-testable: it does plain RGB interpolation
 * and returns a packed 0xRRGGBB the scene hands straight to `setTint`.
 */

/**
 * The highlight tint at `timeMs` into a `periodMs` breathing cycle, lerped between
 * `from` and `to`. Uses a raised-cosine so the pulse eases at both ends (rest at
 * `from`, peak at `to`) rather than snapping. At t=0 it sits exactly on `from`,
 * at the half-period exactly on `to`, and it repeats every `periodMs`.
 */
export function gatherPulseTint(timeMs: number, periodMs: number, from: number, to: number): number {
  const t = 0.5 - 0.5 * Math.cos((2 * Math.PI * timeMs) / periodMs); // smooth 0→1→0
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  const r = lerp((from >> 16) & 0xff, (to >> 16) & 0xff);
  const g = lerp((from >> 8) & 0xff, (to >> 8) & 0xff);
  const b = lerp(from & 0xff, to & 0xff);
  return (r << 16) | (g << 8) | b;
}
