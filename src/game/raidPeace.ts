/**
 * Whether a neighbour presses a sighted raid, or stays its hand because the
 * player has warmed relations to friendly.
 *
 * The interactive raid loop in WorldScene paces raids on a timer, but until now
 * the rival's player-built `relations` — the very value the gift action moves —
 * had no bearing on whether the raid actually came. This is the mirror of the
 * sim's own raid rule ({@link RAID_BALANCE.hostileRelations} in ../sim/rivals):
 * there a rival turns hostile enough to raid *below* a relations floor; here,
 * warming relations up to {@link RAID_PEACE_RELATIONS} (the friendly band) buys
 * peace and calls the raid off. Default relations (0) still press, so the raid
 * threat is unchanged for a player who never courts the neighbour — only
 * diplomacy earns the reprieve.
 *
 * Pure (no Phaser, no DOM) so the raid loop and its tests share one rule.
 */

/**
 * Relations at or above which a neighbour is friendly enough to call off a raid.
 * Matches the "Friendly" disposition band (>= 0.5) and sits above the sim's
 * hostile floor, so peace is something the player reaches by sending gifts.
 */
export const RAID_PEACE_RELATIONS = 0.5;

/** True when a neighbour with these player-relations will press a sighted raid. */
export function raidPressed(relations: number): boolean {
  return relations < RAID_PEACE_RELATIONS;
}
