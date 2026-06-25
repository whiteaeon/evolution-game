import {
  resolveSkirmish,
  RAID_BALANCE,
  RIVAL_BALANCE,
  type RivalTribe,
  type SkirmishSide,
} from "../sim/rivals.js";
import { defenseRating } from "../sim/raids.js";
import type { SimState } from "../sim/simulation.js";
import type { TechEffects } from "../sim/types.js";

/**
 * Pure resolution for the interactive camp-defence event in WorldScene.
 *
 * It reuses the sim's own raid math — {@link defenseRating} (shelter tier +
 * defensive tech) and {@link resolveSkirmish} — so an in-world raid plays out by
 * the same rules as a headless one. The two {@link SkirmishSide}s are built
 * exactly as `maybeRaid` builds them, the only player-driven lever being how many
 * defenders the chieftain rallies. No Phaser, no DOM — render-side game logic
 * only, like {@link ./quests} and {@link ./npcActivity}.
 */
export interface RaidSides {
  attacker: SkirmishSide;
  defender: SkirmishSide;
}

export interface RaidOutcome {
  /** True when the defenders out-fight the raiders (suffer the smaller loss). */
  won: boolean;
  /** Fraction of the raiding party that fell, in [0, maxLossFrac]. */
  attackerLossFrac: number;
  /** Fraction of the defenders that fell, same bound. */
  defenderLossFrac: number;
  /** Raiders' surviving headcount, floored so a tribe is never wiped out. */
  raiderSurvivors: number;
  /** Food the raiders carry off, scaled by how badly the defence fared (0 = clean). */
  plunder: number;
}

/**
 * Build the attacker (the rival party) and defender (chieftain + rallied band)
 * sides for a raid. Mirrors the construction in `maybeRaid`: the attacker's
 * defensive rating rises with its era, the defender's with shelter + tech.
 */
export function buildRaidSides(
  state: SimState,
  effects: Required<TechEffects>,
  raider: RivalTribe,
  defenders: number,
  defenderStrength: number,
): RaidSides {
  return {
    attacker: {
      strength: raider.strength,
      population: raider.population,
      defense: 1 + raider.eraIndex * RAID_BALANCE.defensePerEra,
    },
    defender: {
      strength: defenderStrength,
      population: defenders,
      defense: defenseRating(state, effects),
    },
  };
}

/**
 * Resolve a raid from its two sides via {@link resolveSkirmish}. The defender
 * wins when it takes the smaller loss share; the raiders' survivors and the
 * plundered food both fall straight out of the math, so the outcome is fully
 * determined by strength, numbers, defensive tech and how many were rallied.
 */
export function resolveRaid(sides: RaidSides, plunderBase: number): RaidOutcome {
  const r = resolveSkirmish(sides.attacker, sides.defender);
  const raiderSurvivors = Math.max(
    RIVAL_BALANCE.popFloor,
    sides.attacker.population * (1 - r.attackerLossFrac),
  );
  return {
    won: r.defenderLossFrac < r.attackerLossFrac,
    attackerLossFrac: r.attackerLossFrac,
    defenderLossFrac: r.defenderLossFrac,
    raiderSurvivors,
    plunder: Math.round((plunderBase * r.defenderLossFrac) / RAID_BALANCE.maxLossFrac),
  };
}
