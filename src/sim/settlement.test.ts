import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import { regionById } from "./regions.js";

const WORK = { gather: 4, hunt: 2, research: 3, cook: 1, build: 1 };

function step(sim: Simulation) {
  sim.autoAllocate(WORK);
  if (sim.state.pendingEncounter) sim.resolveEncounter(true);
  if (sim.state.pendingChoice) sim.resolveChoice(0);
  sim.tick();
}

describe("founding a second settlement", () => {
  it("starts with exactly one home settlement that aliases the top-level state", () => {
    const sim = new Simulation({ seed: 7, startingPopulation: 12 });
    expect(sim.state.settlements).toHaveLength(1);
    const home = sim.state.settlements[0];
    // The home settlement is a live view, not a copy.
    expect(home.resources).toBe(sim.state.resources);
    expect(home.members).toBe(sim.state.individuals);
    expect(home.region).toBe(sim.state.region);
    expect(home.biome).toBe(sim.state.biome);
  });

  it("splits off population into a discovered region", () => {
    const sim = new Simulation({ seed: 7, startingPopulation: 12 });
    sim.state.discoveredRegions.push("deepwood");
    const homePopBefore = sim.living.length;

    const st = sim.foundSettlement("deepwood", 5);
    expect(st).not.toBeNull();
    expect(sim.state.settlements).toHaveLength(2);

    // Population is split: 5 leave home, 5 form the new camp.
    expect(st!.members).toHaveLength(5);
    expect(sim.living.length).toBe(homePopBefore - 5);
    // None of the migrants remain in the home pool.
    const homeIds = new Set(sim.state.individuals.map((i) => i.id));
    for (const m of st!.members) expect(homeIds.has(m.id)).toBe(false);

    // The new camp sits in the chosen region/biome with its own fresh shelter.
    expect(st!.region).toBe("deepwood");
    expect(st!.biome).toBe(regionById("deepwood").biome);
    expect(st!.shelter).toBe("cave");
    // It has its own resources object, distinct from the home pool.
    expect(st!.resources).not.toBe(sim.state.resources);
    expect(st!.resources.food).toBeGreaterThan(0); // migrants carry provisions
  });

  it("refuses to found in an uncharted region, beyond two settlements, or without spare people", () => {
    const sim = new Simulation({ seed: 7, startingPopulation: 12 });

    // Region not yet discovered.
    expect(sim.foundSettlement("sunscar", 3)).toBeNull();

    sim.state.discoveredRegions.push("deepwood", "wide-savanna");
    // Too many migrants: home must keep at least two able adults.
    expect(sim.foundSettlement("deepwood", 11)).toBeNull();
    expect(sim.state.settlements).toHaveLength(1);

    // A valid founding succeeds…
    expect(sim.foundSettlement("deepwood", 4)).not.toBeNull();
    // …but the scope is exactly two settlements.
    expect(sim.foundSettlement("wide-savanna", 2)).toBeNull();
    expect(sim.state.settlements).toHaveLength(2);
  });
});

describe("per-settlement production", () => {
  it("the second settlement produces into its own pools from its own members", () => {
    const sim = new Simulation({ seed: 3, startingPopulation: 14 });
    sim.state.discoveredRegions.push("deepwood");
    const st = sim.foundSettlement("deepwood", 6)!;
    expect(st).not.toBeNull();

    // The home camp does nothing (no workers); the second camp gathers + builds.
    const sIndex = sim.state.settlements.indexOf(st);
    sim.setSettlementAllocation(sIndex, "gather", 3);
    sim.setSettlementAllocation(sIndex, "build", 3);

    const homeWoodBefore = sim.state.resources.wood;
    for (let i = 0; i < 10; i++) sim.tick(); // home allocation left at zero

    // The settlement's builders cut wood (forest is wood-rich) and bank labour.
    expect(st.resources.wood).toBeGreaterThan(0);
    expect(st.resources.buildProgress).toBeGreaterThan(0);
    // Production is local: the home pool is untouched by the settlement's work.
    expect(sim.state.resources.wood).toBe(homeWoodBefore);
  });

  it("local biome pressures differ between settlements (forest yields more wood than desert)", () => {
    const forest = new Simulation({ seed: 9, startingPopulation: 14 });
    forest.state.discoveredRegions.push("deepwood");
    const fst = forest.foundSettlement("deepwood", 6)!;
    forest.setSettlementAllocation(forest.state.settlements.indexOf(fst), "build", 4);

    const desert = new Simulation({ seed: 9, startingPopulation: 14 });
    desert.state.discoveredRegions.push("sunscar");
    const dst = desert.foundSettlement("sunscar", 6)!;
    desert.setSettlementAllocation(desert.state.settlements.indexOf(dst), "build", 4);

    for (let i = 0; i < 12; i++) {
      forest.tick();
      desert.tick();
    }
    // Same seed + same allocation, but the forest's biome profile gives far more
    // wood than the desert's — the settlement's location shapes its production.
    expect(fst.resources.wood).toBeGreaterThan(dst.resources.wood);
  });
});

describe("two-settlement save / load", () => {
  it("round-trips both settlements and resumes deterministically", () => {
    const a = new Simulation({ seed: 11, startingPopulation: 14 });
    for (let i = 0; i < 20; i++) step(a);
    a.state.discoveredRegions.push("twin-rivers");
    const st = a.foundSettlement("twin-rivers", 5)!;
    expect(st).not.toBeNull();
    const sIndex = a.state.settlements.indexOf(st);
    a.setSettlementAllocation(sIndex, "gather", 2);
    a.setSettlementAllocation(sIndex, "research", 2);
    for (let i = 0; i < 30; i++) step(a);

    const b = Simulation.load(a.serialize());

    // Both settlements survive the round-trip.
    expect(b.state.settlements).toHaveLength(2);
    const ha = a.state.settlements[1];
    const hb = b.state.settlements[1];
    expect(hb.members.length).toBe(ha.members.length);
    expect(hb.resources.food).toBe(ha.resources.food);
    expect(hb.resources.wood).toBe(ha.resources.wood);
    expect(hb.shelter).toBe(ha.shelter);
    expect(hb.region).toBe(ha.region);
    expect(hb.biome).toBe(ha.biome);
    expect(hb.allocation).toEqual(ha.allocation);

    // The home settlement's alias is re-established on load.
    expect(b.state.settlements[0].resources).toBe(b.state.resources);
    expect(b.state.settlements[0].members).toBe(b.state.individuals);

    // Continuing both produces identical futures (deterministic resume).
    for (let i = 0; i < 25; i++) {
      step(a);
      step(b);
    }
    expect(b.state.tick).toBe(a.state.tick);
    expect(b.living.length).toBe(a.living.length);
    expect(b.state.settlements[1].members.length).toBe(a.state.settlements[1].members.length);
    expect(b.state.settlements[1].resources.food).toBeCloseTo(a.state.settlements[1].resources.food, 10);
    expect([...b.state.knowledge.discovered].sort()).toEqual([...a.state.knowledge.discovered].sort());
  });

  it("loads pre-settlement saves (no settlements field) into a single home camp", () => {
    const sim = new Simulation({ seed: 4, startingPopulation: 10 });
    for (let i = 0; i < 10; i++) step(sim);
    // Simulate an old save that predates the settlements model.
    const raw = JSON.parse(sim.serialize());
    delete raw.state.settlements;
    const loaded = Simulation.load(JSON.stringify(raw));
    expect(loaded.state.settlements).toHaveLength(1);
    expect(loaded.state.settlements[0].resources).toBe(loaded.state.resources);
    expect(loaded.state.settlements[0].members).toBe(loaded.state.individuals);
  });
});

describe("determinism with a second settlement", () => {
  it("two sims with the same seed and actions evolve identically", () => {
    const make = () => {
      const s = new Simulation({ seed: 21, startingPopulation: 14 });
      for (let i = 0; i < 15; i++) step(s);
      s.state.discoveredRegions.push("deepwood");
      const st = s.foundSettlement("deepwood", 5)!;
      s.setSettlementAllocation(s.state.settlements.indexOf(st), "gather", 3);
      for (let i = 0; i < 40; i++) step(s);
      return s;
    };
    const a = make();
    const b = make();
    expect(a.living.length).toBe(b.living.length);
    expect(a.state.settlements[1].members.length).toBe(b.state.settlements[1].members.length);
    expect(a.state.settlements[1].resources.food).toBe(b.state.settlements[1].resources.food);
    expect(a.state.settlements[1].resources.wood).toBe(b.state.settlements[1].resources.wood);
    expect(a.state.totals.births).toBe(b.state.totals.births);
  });
});
