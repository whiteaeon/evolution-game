import { describe, it, expect } from "vitest";
import { Simulation } from "../sim/simulation.js";
import { RAID_BALANCE, RIVAL_BALANCE } from "../sim/rivals.js";
import { buildRaidSides, resolveRaid } from "./raidDefense.js";

/** A real run gives a real SimState + effects bundle + a rival to fight. */
const fixture = () => {
  const sim = new Simulation({ seed: 11, startingPopulation: 14 });
  const state = sim.state;
  const effects = state.knowledge.aggregateEffects();
  const raider = state.rivals[0];
  return { state, effects, raider };
};

describe("interactive raid defence", () => {
  it("builds sides from the rival and the rallied band, mirroring the sim", () => {
    const { state, effects, raider } = fixture();
    const sides = buildRaidSides(state, effects, raider, 6, 0.5);

    expect(sides.attacker.strength).toBe(raider.strength);
    expect(sides.attacker.population).toBe(raider.population);
    expect(sides.attacker.defense).toBeCloseTo(1 + raider.eraIndex * RAID_BALANCE.defensePerEra, 10);

    expect(sides.defender.strength).toBe(0.5);
    expect(sides.defender.population).toBe(6); // chieftain + rallied villagers
    // Defensive rating reuses defenseRating: cave shelter + no tech → exactly 1.
    expect(sides.defender.defense).toBeGreaterThanOrEqual(1);
  });

  it("rewards rallying more defenders with a better outcome", () => {
    const { state, effects, raider } = fixture();
    const lone = resolveRaid(buildRaidSides(state, effects, raider, 1, 0.5), 20);
    const rallied = resolveRaid(buildRaidSides(state, effects, raider, 12, 0.5), 20);

    // More defenders → defenders take a smaller loss share and lose less food.
    expect(rallied.defenderLossFrac).toBeLessThan(lone.defenderLossFrac);
    expect(rallied.plunder).toBeLessThanOrEqual(lone.plunder);
    expect(rallied.attackerLossFrac).toBeGreaterThan(lone.attackerLossFrac);
  });

  it("a strong, numerous, well-defended band wins; a token defence loses", () => {
    const { state, effects, raider } = fixture();
    const strong = resolveRaid(buildRaidSides(state, effects, raider, 30, 0.95), 20);
    const weak = resolveRaid(buildRaidSides(state, effects, raider, 1, 0.05), 20);

    expect(strong.won).toBe(true);
    expect(weak.won).toBe(false);
  });

  it("floors raider survivors and keeps plunder in [0, plunderBase]", () => {
    const { state, effects, raider } = fixture();
    const out = resolveRaid(buildRaidSides(state, effects, raider, 50, 0.95), 20);

    expect(out.raiderSurvivors).toBeGreaterThanOrEqual(RIVAL_BALANCE.popFloor);
    expect(out.raiderSurvivors).toBeLessThanOrEqual(raider.population);
    expect(out.plunder).toBeGreaterThanOrEqual(0);
    expect(out.plunder).toBeLessThanOrEqual(20);
  });

  it("is a pure, deterministic function of its inputs", () => {
    const { state, effects, raider } = fixture();
    const sides = buildRaidSides(state, effects, raider, 7, 0.4);
    expect(resolveRaid(sides, 20)).toEqual(resolveRaid(sides, 20));
  });
});
