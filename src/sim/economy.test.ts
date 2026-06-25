import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import { BALANCE } from "./balance.js";

/**
 * The slow survival economy WorldScene drives via {@link Simulation.economyTick}:
 * the food the player gathers feeds the tribe, player housing raises the
 * population ceiling, scarcity culls, and none of the management machinery
 * (research, encounters) runs behind the player's back.
 */
describe("economyTick (interactive survival loop)", () => {
  it("eats the shared food store each step (the player's gathering feeds the tribe)", () => {
    // reproMinAge above every founder's age means no births this step, isolating
    // consumption; cooking is inactive at start so the per-capita draw is the base.
    const sim = new Simulation({ seed: 1, startingPopulation: 10, startingFood: 40, reproMinAge: 99 });
    const before = sim.state.resources.food;
    const pop = sim.living.length;
    sim.economyTick(0);
    const consumed = before - sim.state.resources.food;
    expect(consumed).toBeCloseTo(pop * BALANCE.consumptionPerCapita, 5);
  });

  it("lets player housing lift the population ceiling", () => {
    // Well-fed, warm and ageless so the carrying capacity — not food, cold or old
    // age — is what bounds the tribe; then housing should be the only difference.
    const grow = (housingBonus: number): number => {
      const sim = new Simulation({
        seed: 7,
        startingPopulation: 8,
        startingFood: 60,
        baseCold: 0,
        maxAge: 100_000,
        reproMaxAge: 100_000,
      });
      for (let i = 0; i < 120; i++) {
        sim.state.resources.food = 60; // keep food security high so capacity binds
        sim.economyTick(housingBonus);
      }
      return sim.living.length;
    };
    const unhoused = grow(0);
    const housed = grow(40);
    expect(unhoused).toBeGreaterThan(8); // the tribe grows from its founders
    expect(housed).toBeGreaterThan(unhoused); // more huts → a higher ceiling
  });

  it("shrinks a starving tribe (scarcity has teeth)", () => {
    const sim = new Simulation({ seed: 3, startingPopulation: 12, startingFood: 0, baseCold: 0.5 });
    const before = sim.living.length;
    for (let i = 0; i < 30; i++) sim.economyTick(0);
    expect(sim.living.length).toBeLessThan(before);
    expect(sim.state.resources.food).toBe(0); // nothing is produced; it only drains
  });

  it("never advances the tech tree or queues a decision the scene can't show", () => {
    const sim = new Simulation({ seed: 5, startingPopulation: 10, startingFood: 100 });
    const knownBefore = sim.state.knowledge.discovered.size;
    const targetBefore = sim.state.researchTarget;
    for (let i = 0; i < 50; i++) {
      sim.state.resources.food = 100;
      sim.economyTick(0);
    }
    expect(sim.state.knowledge.discovered.size).toBe(knownBefore); // no auto-research
    expect(sim.state.researchTarget).toBe(targetBefore);
    expect(sim.state.pendingEncounter).toBeNull();
    expect(sim.state.pendingChoice).toBeNull();
  });

  it("turns the seasons as it runs", () => {
    const sim = new Simulation({ seed: 9, startingPopulation: 10, startingFood: 100 });
    const seasons = new Set<number>();
    for (let i = 0; i < 8; i++) {
      sim.state.resources.food = 100;
      sim.economyTick(0);
      seasons.add(sim.state.world.seasonIndex);
    }
    expect(seasons.size).toBeGreaterThan(1); // the year cycles, so scarcity windows come and go
  });
});
