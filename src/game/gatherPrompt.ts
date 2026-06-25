/**
 * Pure label for the floating gather prompt over the aimed node.
 *
 * The prompt used to read a flat "Hold Space: gather wood" with no sense of how
 * much the node still holds — the player only learned a node was nearly spent
 * when it suddenly wilted away. The sprite shrinks as it depletes (see
 * {@link ./nodeDepletion}), but that read is coarse; this gives a precise count
 * of how many more swings the node will give, and flags the final swing so the
 * player can decide whether to finish it or move on. Kept Phaser-free so the
 * wording is unit-testable; the scene owns the actual Text object and feeds it
 * this string.
 */

/**
 * Text for the gather prompt over a node of `kind` with `remaining` units left.
 *
 * While the swing is on cooldown (`ready` false) it shows a quiet "…" so the
 * label doesn't flicker the full prompt between hits. Once ready it names the
 * action and appends the remaining yield: "(last)" on the final swing, otherwise
 * a "×N" count. A non-positive `remaining` is treated as the last swing.
 */
export function gatherPromptText(kind: string, ready: boolean, remaining: number): string {
  if (!ready) return "…";
  const label = `Hold Space: gather ${kind}`;
  return remaining <= 1 ? `${label} (last)` : `${label} ×${remaining}`;
}
