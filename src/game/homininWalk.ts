/**
 * Pure walk-cycle data shared by the texture baker (textures.ts) and the scene
 * (MainScene.ts). Kept Phaser-free so the dedup invariant can be unit-tested
 * without a canvas: the renderer bakes one texture per *pose* per morph, never
 * per frame of playback, so textures stay bounded by the morph signature.
 */

/** Number of distinct poses baked per morph: 0 = passing, 1/2 = foot contacts. */
export const HOMININ_POSES = 3;

/**
 * 4-beat walk loop over the 3 poses (passing, left contact, passing, right
 * contact). Re-using the passing pose twice keeps a smooth gait at 3 textures.
 */
export const HOMININ_WALK = [0, 1, 0, 2] as const;

/**
 * Texture key for a pose. Pose 0 reuses the morph's base key (so it is not baked
 * a second time); poses 1+ append the index. Two individuals with the same morph
 * signature therefore share every frame's texture.
 */
export const homininFrameKey = (baseKey: string, pose: number): string =>
  pose === 0 ? baseKey : `${baseKey}_${pose}`;
