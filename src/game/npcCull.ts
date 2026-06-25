import { isPointVisible, type ViewRect } from "./cull.js";

/**
 * Margin (px) added around the camera view when deciding whether a villager's
 * per-frame walk animation is worth running. Wider than the particle cull margin
 * so a slow-walking NPC doesn't visibly freeze right at the screen edge before it
 * scrolls fully into view.
 */
export const NPC_CULL_MARGIN = 64;

/**
 * Whether a villager standing at world point `(x, y)` is close enough to the
 * camera `view` to be worth animating this frame. Off-screen NPCs are purely
 * decorative, so the caller skips their texture/scale/movement work (and the
 * re-pick search) until they scroll back into view.
 */
export function npcOnScreen(x: number, y: number, view: ViewRect): boolean {
  return isPointVisible(x, y, view, NPC_CULL_MARGIN);
}
