/**
 * Pure depletion-urgency colour for the aimed gather node's highlight peak.
 *
 * The aimed node already breathes between a rest tint and a peak (see
 * {@link ./gatherPulse}), but that peak is fixed, so a node nine swings deep and
 * one swing from gone glow identically — the player only learns a node is nearly
 * spent from the prompt's "×N"/"(last)" text. This warms the breathing *peak*
 * from a calm pale tone toward a hotter amber as the node thins out, giving a
 * peripheral, colour-and-brightness read of "running low" without having to watch
 * the prompt. Kept Phaser-free so the easing is unit-testable: the scene feeds the
 * returned 0xRRGGBB straight into {@link ./gatherPulse} as the pulse's `to` colour.
 */

/**
 * The highlight peak colour for a node with `amount` of `init` units left, lerped
 * from `calm` (a full node) toward `hot` (a spent one). Uses the depleted fraction
 * `1 - amount/init`, clamped, so it sits exactly on `calm` at full and exactly on
 * `hot` once empty, warming monotonically in between. A non-positive `init` is
 * treated as fully spent (returns `hot`), so a freshly-removed node never lingers
 * on the calm tone.
 */
export function gatherUrgencyPeak(amount: number, init: number, calm: number, hot: number): number {
  const frac = init > 0 ? Math.min(1, Math.max(0, amount / init)) : 0;
  const t = 1 - frac; // 0 at full, 1 at empty
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  const r = lerp((calm >> 16) & 0xff, (hot >> 16) & 0xff);
  const g = lerp((calm >> 8) & 0xff, (hot >> 8) & 0xff);
  const b = lerp(calm & 0xff, hot & 0xff);
  return (r << 16) | (g << 8) | b;
}
