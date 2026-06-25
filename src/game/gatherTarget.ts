/**
 * Pure selection of which gatherable node the player is aiming at.
 *
 * The scene shows a "Space: gather" prompt over the targeted node and harvests
 * that same node, so the choice must be *stable*: picking the bare nearest node
 * every frame makes the prompt — and the node Space harvests — flicker between
 * two roughly-equidistant nodes as the player drifts. This adds hysteresis so a
 * held target only yields to one that is meaningfully closer, keeping the prompt
 * and harvest target steady. Kept Phaser-free so the logic is unit-testable.
 */

/** Minimal position a candidate node exposes for targeting. */
export interface TargetPos {
  x: number;
  y: number;
}

/**
 * Choose the targeted node's index into `candidates`, or -1 when none is within
 * `range` of (px, py).
 *
 * If `prev` is still in range, it is kept unless another candidate is closer by
 * more than `stick` px — the stickiness margin that suppresses flicker.
 */
export function pickGatherTarget(
  px: number,
  py: number,
  candidates: readonly TargetPos[],
  prev: number,
  range: number,
  stick: number,
): number {
  let best = -1;
  let bestD = range;
  for (let i = 0; i < candidates.length; i++) {
    const d = Math.hypot(candidates[i].x - px, candidates[i].y - py);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best === -1) return -1;
  // Hold the previous target if it is still in range and the new best is not
  // closer by more than the stickiness margin.
  if (prev >= 0 && prev < candidates.length && prev !== best) {
    const pd = Math.hypot(candidates[prev].x - px, candidates[prev].y - py);
    if (pd < range && pd - bestD <= stick) return prev;
  }
  return best;
}
