import { applyHazard } from "./events.js";
import {
  evolveRival,
  resolveSkirmish,
  RAID_BALANCE,
  RIVAL_BALANCE,
  type SkirmishSide,
} from "./rivals.js";
import { SHELTERS, type TechEffects } from "./types.js";
import type { SimState } from "./simulation.js";
import type { RNG } from "./rng.js";
import type { SimEngine } from "./engine.js";

/**
 * A hostile rival raids the tribe. Fires only when a neighbour's relations have
 * soured past {@link RAID_BALANCE.hostileRelations}; the timing is drawn on the
 * rival RNG stream, so *whether* a raid happens never perturbs the player's own
 * stream or replay. The skirmish is resolved deterministically by
 * {@link resolveSkirmish}: both sides take losses scaled by strength, numbers,
 * defensive tech and (for the tribe) shelter tier. Player casualties go through
 * the existing mortality model ({@link applyHazard}); the raiders lose a matching
 * share of their headcount, floored so a tribe is never wiped out.
 */
export function maybeRaid(eng: SimEngine, e: Required<TechEffects>): void {
  const s = eng.state;
  if (s.rivals.length === 0 || eng.living.length < 2) return;
  if (s.tick % RAID_BALANCE.raidInterval !== 0) return;
  const hostiles = s.rivals.filter((r) => r.relations <= RAID_BALANCE.hostileRelations);
  if (hostiles.length === 0) return;
  if (!eng.rivalRng.chance(0.5)) return;
  const raider = eng.rivalRng.pick(hostiles);

  const defender: SkirmishSide = {
    strength: eng.traitAverages().traits.strength,
    population: eng.living.length,
    defense: defenseRating(s, e),
  };
  const attacker: SkirmishSide = {
    strength: raider.strength,
    population: raider.population,
    defense: 1 + raider.eraIndex * RAID_BALANCE.defensePerEra,
  };
  const outcome = resolveSkirmish(attacker, defender);

  // Player losses through the existing per-individual mortality model.
  const lost = applyHazard(eng, "strength", outcome.defenderLossFrac);
  // Raiders lose a matching share of their headcount (floored so they persist).
  raider.population = Math.max(
    RIVAL_BALANCE.popFloor,
    raider.population * (1 - outcome.attackerLossFrac),
  );

  eng.logEvent(
    "raid",
    lost
      ? `${raider.name} raid the settlement — ${lost} fell defending it.`
      : `${raider.name} raid the settlement, but are driven off.`,
  );
}

/** The tribe's defensive rating for a skirmish: shelter tier + defensive tech. */
function defenseRating(s: SimState, e: Required<TechEffects>): number {
  const shelterTier = SHELTERS.indexOf(s.shelter); // 0 (cave) … 4 (city)
  // defenseMult is a lethality multiplier (<1 = better defended); invert to a
  // non-negative bonus so hunting/bronze/iron/gunpowder raise the rating.
  const techDefense = Math.max(0, 1 - e.defenseMult);
  return 1 + shelterTier * RAID_BALANCE.defensePerShelterTier + techDefense;
}

/**
 * Evolve the AI neighbour tribes one tick on their own RNG stream. Pure sim:
 * they grow/decline, drift in strength and mood, and slowly climb their own
 * tech ladder, independent of (and invisible to) the player's mechanics.
 */
export function evolveRivals(s: SimState, rivalRng: RNG): void {
  for (const r of s.rivals) evolveRival(r, rivalRng);
}
