import type { ViewRect } from "./cull.js";

/**
 * Pure placement maths for an off-screen quest-giver compass arrow.
 *
 * When a quest flips to "ready" the player is told to return to its giver, but
 * if the giver is off-screen there is no hint which way to walk. This computes a
 * screen-space marker pinned to the viewport edge and angled toward the giver,
 * or `null` when the giver is already comfortably on-screen (so the caller hides
 * the arrow and lets the giver's own "!" marker take over). Kept Phaser-free so
 * the geometry is unit-testable; the scene owns the actual arrow object.
 */

export interface CompassMark {
  /** Screen-space position, clamped `pad` px inside the viewport edge. */
  x: number;
  y: number;
  /** Degrees toward the target (0 = right), for rotating a "➤" glyph directly. */
  angle: number;
}

/**
 * Edge marker for a target at world `(tx, ty)` given the camera `view` and the
 * `screenW`×`screenH` viewport. Returns `null` when the target sits at least
 * `pad` px inside every edge (on-screen); otherwise clamps the centre→target ray
 * to the inset rectangle so the arrow rides the edge nearest the target.
 */
export function questCompass(
  tx: number,
  ty: number,
  view: ViewRect,
  screenW: number,
  screenH: number,
  pad: number,
): CompassMark | null {
  // Target in screen space, derived as a fraction of the view so any camera zoom
  // (view.width ≠ screenW) is handled correctly.
  const sx = ((tx - view.x) / view.width) * screenW;
  const sy = ((ty - view.y) / view.height) * screenH;
  if (sx >= pad && sx <= screenW - pad && sy >= pad && sy <= screenH - pad) {
    return null; // on-screen — no arrow needed
  }
  const cx = screenW / 2;
  const cy = screenH / 2;
  const dx = sx - cx;
  const dy = sy - cy;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  // Scale the ray so it just touches the inset rectangle's nearest edge.
  const halfW = Math.max(1, screenW / 2 - pad);
  const halfH = Math.max(1, screenH / 2 - pad);
  const scale = Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH, 1e-6);
  return { x: cx + dx / scale, y: cy + dy / scale, angle };
}
