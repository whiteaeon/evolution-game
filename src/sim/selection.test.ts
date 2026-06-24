import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";

/**
 * Selection tests: run the sim under a directional pressure and assert that the
 * population's average for the favored trait rises over generations. We average
 * across several seeds to keep the assertion robust against RNG noise.
 */
function meanTraitShift(
  trait: "coldTolerance" | "intelligence" | "diseaseResistance",
  configure: (sim: Simulation) => void,
  seeds: number[],
  ticks: number,
  startRegion = "wide-savanna", // mild grassland by default, so the biome doesn't dominate
): { start: number; end: number } {
  let start = 0;
  let end = 0;
  let counted = 0;
  for (const seed of seeds) {
    const sim = new Simulation({ seed, startingPopulation: 14, carryingCapacityBase: 22, startRegion });
    configure(sim);
    const before = sim.traitAverages().traits[trait];
    sim.run(ticks);
    if (sim.living.length < 4) continue; // tribe collapsed; skip this seed
    start += before;
    end += sim.traitAverages().traits[trait];
    counted++;
  }
  expect(counted).toBeGreaterThan(0);
  return { start: start / counted, end: end / counted };
}

describe("selection shifts trait averages over generations", () => {
  it("a harsh ice age raises average coldTolerance", () => {
    const { start, end } = meanTraitShift(
      "coldTolerance",
      (sim) => {
        sim.setAllocation("gather", 4);
        sim.setAllocation("hunt", 3);
        sim.setAllocation("research", 1);
      },
      [1, 2, 3, 4, 5],
      120,
      "frostvale", // the frozen tundra
    );
    // Cold killed the cold-intolerant; survivors' descendants run warmer-blooded.
    expect(end).toBeGreaterThan(start + 0.03);
  });

  it("cooking applies an upward intelligence pressure", () => {
    // Compare the same world WITH cooking vs WITHOUT, all else equal.
    const seeds = [10, 11, 12, 13, 14, 15];

    const withCooking = meanTraitShift(
      "intelligence",
      (sim) => {
        // Pre-grant the tech chain up to cooking so cooking is active immediately.
        sim.state.knowledge.discovered.add("stoneTools");
        sim.state.knowledge.discovered.add("fire");
        sim.state.knowledge.discovered.add("cooking");
        sim.setAllocation("gather", 4);
        sim.setAllocation("hunt", 2);
        sim.setAllocation("cook", 2);
      },
      seeds,
      200,
    );

    const withoutCooking = meanTraitShift(
      "intelligence",
      (sim) => {
        sim.state.knowledge.discovered.add("stoneTools");
        sim.setAllocation("gather", 4);
        sim.setAllocation("hunt", 2);
      },
      seeds,
      200,
    );

    // Cooking should push intelligence up, and leave it clearly higher than an
    // otherwise-identical world with no cooking — which is the proper control,
    // since without cooking intelligence is neutral and drifts (often downward).
    expect(withCooking.end).toBeGreaterThan(withCooking.start);
    expect(withCooking.end).toBeGreaterThan(withoutCooking.end + 0.03);
  });

  it("recurring disease raises average diseaseResistance", () => {
    const { start, end } = meanTraitShift(
      "diseaseResistance",
      (sim) => {
        sim.setAllocation("gather", 5);
        sim.setAllocation("hunt", 3);
      },
      [20, 21, 22, 23, 24, 25],
      150,
      "twin-rivers", // the river valley: more fever, and it rewards resistance
    );
    expect(end).toBeGreaterThan(start);
  });
});
