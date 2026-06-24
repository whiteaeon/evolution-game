import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import { REGIONS, regionById, BIOME_PROFILE } from "./regions.js";

const WORK = { gather: 5, hunt: 3, research: 1 } as const;

function meanTrait(
  trait: "coldTolerance" | "diseaseResistance",
  region: string,
  seeds: number[],
  ticks: number,
): number {
  let sum = 0;
  let n = 0;
  for (const seed of seeds) {
    const sim = new Simulation({ seed, startingPopulation: 14, carryingCapacityBase: 24, startRegion: region });
    for (const [t, c] of Object.entries(WORK)) sim.setAllocation(t as never, c);
    sim.run(ticks);
    if (sim.living.length < 4) continue;
    sum += sim.traitAverages().traits[trait];
    n++;
  }
  return sum / Math.max(1, n);
}

describe("biome shapes evolution", () => {
  it("the fever-ridden river selects for diseaseResistance far more than the dry desert", () => {
    // diseaseResistance is driven only by disease + the biome's reward, so it is
    // a clean read on location-as-selection-pressure.
    const seeds = [1, 2, 3, 4, 5, 6];
    const river = meanTrait("diseaseResistance", "twin-rivers", seeds, 140);
    const desert = meanTrait("diseaseResistance", "sunscar", seeds, 140);
    expect(river).toBeGreaterThan(desert + 0.06);
  });

  it("the tundra raises coldTolerance over a long stay", () => {
    const seeds = [1, 2, 3, 4, 5, 6];
    const tundra = meanTrait("coldTolerance", "frostvale", seeds, 200);
    expect(tundra).toBeGreaterThan(0.5);
  });

  it("every region maps to a defined biome profile", () => {
    for (const r of REGIONS) expect(BIOME_PROFILE[r.biome]).toBeDefined();
  });
});

describe("migration", () => {
  it("costs more for more distant regions", () => {
    const sim = new Simulation({ seed: 1, startRegion: "frostvale" });
    const near = sim.migrationCost("deepwood");
    const far = sim.migrationCost("sunscar");
    expect(far.distance).toBeGreaterThan(near.distance);
    expect(far.food).toBeGreaterThan(near.food);
  });

  it("moves the tribe, changes the biome, and spends food", () => {
    const sim = new Simulation({ seed: 4, startingPopulation: 16 });
    sim.state.resources.food = 200;
    const foodBefore = sim.state.resources.food;
    const popBefore = sim.living.length;

    const deaths = sim.migrate("twin-rivers");

    expect(sim.state.region).toBe("twin-rivers");
    expect(sim.state.biome).toBe(regionById("twin-rivers").biome);
    expect(sim.state.resources.food).toBeLessThan(foodBefore);
    expect(deaths).toBeGreaterThanOrEqual(0);
    expect(deaths).toBeLessThanOrEqual(popBefore);
    expect(sim.living.length).toBe(popBefore - deaths);
  });

  it("is a no-op when migrating to the current region", () => {
    const sim = new Simulation({ seed: 4, startRegion: "deepwood" });
    const before = sim.living.length;
    expect(sim.migrate("deepwood")).toBe(0);
    expect(sim.living.length).toBe(before);
  });

  it("a long journey while underfed kills more than a short, well-fed one", () => {
    // Averaged over seeds: distance + starvation should raise the toll.
    const tollFor = (region: string, food: number, seeds: number[]) => {
      let total = 0;
      for (const seed of seeds) {
        const sim = new Simulation({ seed, startingPopulation: 20, startRegion: "frostvale" });
        sim.state.resources.food = food;
        total += sim.migrate(region);
      }
      return total / seeds.length;
    };
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const longHungry = tollFor("sunscar", 0, seeds); // far + no food
    const shortFed = tollFor("deepwood", 500, seeds); // near + plenty
    expect(longHungry).toBeGreaterThan(shortFed);
  });
});
