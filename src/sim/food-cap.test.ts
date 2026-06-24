import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";

describe("food storage cap", () => {
  it("bounds stored food by the carrying-capacity-scaled cap every tick", () => {
    const sim = new Simulation({ seed: 42, startingPopulation: 12 });
    for (let i = 0; i < 600; i++) {
      sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
      if (sim.state.pendingEncounter) sim.resolveEncounter(true);
      sim.tick();
      const cap = sim.foodStorageCap(sim.state.knowledge.aggregateEffects());
      expect(sim.state.resources.food).toBeLessThanOrEqual(cap);
    }
  });

  it("clamps a food pile that starts above the cap down to the cap", () => {
    const sim = new Simulation({ seed: 7, startingPopulation: 12 });
    sim.state.resources.food = 1_000_000;
    sim.tick();
    const cap = sim.foodStorageCap(sim.state.knowledge.aggregateEffects());
    expect(sim.state.resources.food).toBeLessThanOrEqual(cap);
    // The cap is a real bound, not effectively infinite.
    expect(cap).toBeLessThan(10_000);
  });
});
