import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import { SCENARIOS, SCENARIO_PRESETS, type Scenario } from "./scenarios.js";
import { regionById } from "./regions.js";

/** Autopilot identical to the headless driver, parameterised by scenario config. */
function autoplay(scenario: Scenario, seed: number, budget = 4000): Simulation {
  const sim = new Simulation({ seed, ...SCENARIO_PRESETS[scenario].config });
  for (let i = 0; i < budget && sim.living.length > 0 && !sim.state.won; i++) {
    sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
    if (sim.state.pendingEncounter) sim.resolveEncounter(true);
    if (sim.state.pendingChoice) sim.resolveChoice(0);
    sim.tick();
  }
  return sim;
}

describe("start scenarios", () => {
  it("exposes exactly the four scenarios, keyed by id", () => {
    expect(SCENARIOS).toEqual(["valley", "frozen", "island", "crowded"]);
    for (const s of SCENARIOS) expect(SCENARIO_PRESETS[s].id).toBe(s);
  });

  it("each scenario is a valid, constructible config that sizes the starting state", () => {
    for (const s of SCENARIOS) {
      const c = SCENARIO_PRESETS[s].config;
      expect(c.startingPopulation).toBeGreaterThan(0);
      expect(c.startingFood).toBeGreaterThan(0);
      expect(c.baseCold).toBeGreaterThanOrEqual(0);
      expect(c.carryingCapacityBase).toBeGreaterThan(0);
      // The named start region must exist (regionById falls back silently otherwise).
      expect(regionById(c.startRegion!).id).toBe(c.startRegion);

      // Constructs and produces the requested starting state, sized to the scenario.
      const sim = new Simulation({ seed: 1, ...c });
      expect(sim.living.length).toBe(c.startingPopulation);
      expect(sim.state.resources.food).toBe(c.startingFood);
      expect(sim.state.region).toBe(c.startRegion);
      expect(sim.state.biome).toBe(regionById(c.startRegion!).biome);
    }
  });

  it("the scenarios start in distinct biomes — varied challenge, not reskins", () => {
    const biomes = SCENARIOS.map((s) => regionById(SCENARIO_PRESETS[s].config.startRegion!).biome);
    expect(new Set(biomes).size).toBe(SCENARIOS.length);
  });

  it("standard scenarios reach the Information Age under autopilot", () => {
    for (const s of SCENARIOS.filter((s) => SCENARIO_PRESETS[s].standard)) {
      const sim = autoplay(s, 42);
      expect(sim.state.won, `${s} should complete`).toBe(true);
      expect(sim.state.era).toBe("Information");
      expect(sim.state.tick).toBeGreaterThanOrEqual(150);
      expect(sim.state.tick).toBeLessThanOrEqual(2000);
    }
  });

  it("challenge scenarios are survivable — a win is possible for at least one seed", () => {
    // Challenge scenarios are meant to be lean: many seeds end in extinction. What
    // the scenario must guarantee is that a win is *possible*, not that every seed
    // survives.
    for (const s of SCENARIOS.filter((s) => !SCENARIO_PRESETS[s].standard)) {
      const won = Array.from({ length: 12 }, (_, i) => autoplay(s, i + 1)).some(
        (sim) => sim.state.won,
      );
      expect(won, `${s} should be winnable on some seed`).toBe(true);
    }
  });
});
