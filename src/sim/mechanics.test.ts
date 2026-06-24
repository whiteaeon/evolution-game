import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import type { Lineage } from "./types.js";

describe("interbreeding", () => {
  function forceEncounter(sim: Simulation, lineage: Lineage) {
    sim.state.pendingEncounter = {
      lineage,
      message: "test",
      expiresTick: sim.state.tick + 6,
    };
  }

  it("accepting injects archetype-leaning kin that raise the relevant trait", () => {
    const sim = new Simulation({ seed: 3, startingPopulation: 10 });
    const before = sim.living.length;
    const strBefore = sim.traitAverages().traits.strength;

    forceEncounter(sim, "neanderthal");
    sim.resolveEncounter(true);

    // New individuals joined, tagged with the lineage.
    expect(sim.living.length).toBeGreaterThan(before);
    const newcomers = sim.living.filter((i) => i.lineage === "neanderthal");
    expect(newcomers.length).toBeGreaterThanOrEqual(2);
    // Neanderthal blood is stronger than the tribe was.
    const newcomerStr = newcomers.reduce((a, i) => a + i.genome.strength, 0) / newcomers.length;
    expect(newcomerStr).toBeGreaterThan(strBefore);
    expect(sim.state.totals.interbred).toBe(1);
  });

  it("declining changes nothing but clears the offer", () => {
    const sim = new Simulation({ seed: 3, startingPopulation: 10 });
    const before = sim.living.length;
    forceEncounter(sim, "sapiens");
    sim.resolveEncounter(false);
    expect(sim.living.length).toBe(before);
    expect(sim.state.pendingEncounter).toBeNull();
    expect(sim.state.totals.interbred).toBe(0);
  });

  it("sapiens contact lifts intelligence over generations", () => {
    // Repeated Sapiens admixture should pull the gene pool's intelligence up.
    const sim = new Simulation({ seed: 8, startingPopulation: 12, baseCold: 0.4 });
    const intStart = sim.traitAverages().traits.intelligence;
    for (let i = 0; i < 120; i++) {
      sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1 });
      sim.state.pendingEncounter = {
        lineage: "sapiens",
        message: "t",
        expiresTick: sim.state.tick + 2,
      };
      sim.resolveEncounter(true);
      sim.tick();
    }
    expect(sim.living.length).toBeGreaterThan(4);
    expect(sim.traitAverages().traits.intelligence).toBeGreaterThan(intStart + 0.03);
  });
});

describe("goals", () => {
  it("names the next era's capstone and missing prereqs", () => {
    const sim = new Simulation({ seed: 1 });
    sim.tick();
    expect(sim.state.goal).toContain("Neolithic");
    expect(sim.state.goal.toLowerCase()).toContain("agriculture");
  });
});
