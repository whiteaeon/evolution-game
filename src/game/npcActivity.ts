/**
 * Pure, Phaser-free decision for what a wandering villager does next, so the
 * ambient-behaviour rule can be unit-tested without a canvas. The scene
 * (WorldScene.ts) supplies what's around the villager and two rolls in [0,1);
 * this returns the activity to play. Keep it free of Phaser/DOM.
 */

/** Ambient things a villager can be doing in the world. */
export type NpcActivity = "wander" | "gather" | "campfire";

export interface NpcActivityInputs {
  /** Is it night? (villagers cluster around fire after dark.) */
  night: boolean;
  /** Is there a campfire to gather around? */
  hasCampfire: boolean;
  /** Is there a tree/bush/crop within reach to work? */
  hasNearbyNode: boolean;
  /** Roll deciding whether to head for the fire at night, in [0,1). */
  campfireRoll: number;
  /** Roll deciding whether to go work a node by day, in [0,1). */
  workRoll: number;
}

/**
 * After dark most of the band drifts to a campfire; by day about half walk to a
 * nearby gatherable to work it (trees/bushes/farm crops). Everyone else strolls.
 */
export function chooseNpcActivity(i: NpcActivityInputs): NpcActivity {
  if (i.night && i.hasCampfire && i.campfireRoll < 0.7) return "campfire";
  if (i.hasNearbyNode && i.workRoll < 0.5) return "gather";
  return "wander";
}
