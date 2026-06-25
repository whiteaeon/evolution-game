/**
 * Pure decision for whether a building may be placed on the aimed tile.
 *
 * The ghost footprint used to read ONLY affordability (green/red) — so a player
 * could drop a hut straight on top of a tree, rock or another hut, leaving two
 * collision blockers stacked on one spot. This folds in a second, equally
 * important question: is the tile physically clear? The scene tests the
 * footprint against its collision solids (see {@link ./solids}) and passes the
 * result here; this picks the validity and the refusal reason. Kept Phaser-free
 * so the rule is unit-testable; the scene owns the ghost tint and the deny SFX.
 */

export interface PlacementCheck {
  /** True when the build may be placed here. */
  ok: boolean;
  /** Empty when ok; otherwise a short reason to flash on a refused placement. */
  reason: string;
}

/**
 * Decide placement validity from affordability and footprint clearance.
 *
 * Affordability is reported first: a player who can't pay should gather before
 * worrying about the spot. Only once they can afford it does an overlapping tile
 * become the blocker. `costRes` names the resource so the refusal can say which.
 */
export function checkPlacement(affordable: boolean, overlaps: boolean, costRes: string): PlacementCheck {
  if (!affordable) return { ok: false, reason: `Not enough ${costRes}` };
  if (overlaps) return { ok: false, reason: "Blocked — clear the spot" };
  return { ok: true, reason: "" };
}
