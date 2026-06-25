import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import { REGIONS } from "./regions.js";

/**
 * Run a fed tribe with a fixed gather + scouting assignment until either the
 * whole map is charted or the tick budget runs out. Gatherers keep the tribe
 * alive (so idle hands remain free to scout); no builders or hunters are
 * assigned, so wood/stone/hide can only ever come from a scouting cache.
 */
function scout(seed: number, scouts: number, untilDiscovered: number, maxTicks = 600): Simulation {
  const sim = new Simulation({ seed, startingPopulation: 20, startingFood: 200 });
  for (let i = 0; i < maxTicks && sim.state.discoveredRegions.length < untilDiscovered; i++) {
    sim.setAllocation("gather", 8);
    sim.setScouts(scouts);
    sim.tick();
  }
  return sim;
}

const chartLogs = (sim: Simulation) =>
  sim.state.log.filter((e) => e.message.startsWith("Scouts chart"));

describe("scouting — fog of war", () => {
  it("starts with only the home region charted", () => {
    const sim = new Simulation({ seed: 1, startRegion: "frostvale" });
    expect(sim.state.discoveredRegions).toEqual(["frostvale"]);
  });

  it("reveals the nearest fogged region first, then works outward", () => {
    const sim = scout(1, 4, 3);
    // Frostvale's nearest neighbours are Deepwood then Highwood.
    expect(sim.state.discoveredRegions.slice(0, 3)).toEqual([
      "frostvale",
      "deepwood",
      "highwood",
    ]);
  });

  it("eventually charts the entire map", () => {
    const sim = scout(3, 4, REGIONS.length);
    expect(sim.state.discoveredRegions.length).toBe(REGIONS.length);
    expect([...sim.state.discoveredRegions].sort()).toEqual(REGIONS.map((r) => r.id).sort());
  });

  it("reveals nothing when no scouts are assigned", () => {
    const sim = new Simulation({ seed: 1, startingPopulation: 20, startingFood: 200 });
    for (let i = 0; i < 200; i++) {
      sim.setAllocation("gather", 8);
      sim.tick();
    }
    expect(sim.state.discoveredRegions).toEqual(["frostvale"]);
    expect(chartLogs(sim)).toHaveLength(0);
  });

  it("draws scouts only from idle labour — a fully-tasked tribe explores nothing", () => {
    const sim = new Simulation({ seed: 1, startingPopulation: 20, startingFood: 200 });
    for (let i = 0; i < 200; i++) {
      // Every able adult is gathering, so there are no idle hands to scout.
      sim.setAllocation("gather", 40);
      sim.setScouts(8);
      sim.tick();
    }
    expect(sim.state.discoveredRegions).toEqual(["frostvale"]);
  });
});

describe("scouting — outcomes", () => {
  it("a charted region surfaces a resource cache (seed 1, deterministic)", () => {
    // seed 1 charts Deepwood (forest) as a cache on the first reveal.
    const sim = scout(1, 4, 2);
    expect(sim.state.discoveredRegions).toContain("deepwood");
    // No builders/hunters are assigned, so these can only be a scouting cache:
    // forest profile (wood 1.4, stone 0.6, hide 1.0) × 14 base = 20 / 8 / 14.
    expect(sim.state.resources.wood).toBe(20);
    expect(sim.state.resources.stone).toBe(8);
    expect(sim.state.resources.hide).toBe(14);
    expect(chartLogs(sim)[0].message).toContain("cache");
  });

  it("a charted region can instead surface a small foraging find (seed 7, deterministic)", () => {
    // seed 7 charts Deepwood as a foraging find: +12 food, no raw goods.
    const sim = scout(7, 4, 2);
    expect(sim.state.discoveredRegions).toContain("deepwood");
    expect(sim.state.resources.wood).toBe(0);
    expect(sim.state.resources.stone).toBe(0);
    const first = chartLogs(sim)[0];
    expect(first.type).toBe("discovery");
    expect(first.message).toContain("foraging party returns with +12 food");
  });

  it("every reveal logs exactly one discovery event, split between caches and finds", () => {
    const sim = scout(3, 4, REGIONS.length);
    const charted = chartLogs(sim);
    // One event per newly-charted region (every region but the home one).
    expect(charted).toHaveLength(REGIONS.length - 1);
    expect(charted.every((e) => e.type === "discovery")).toBe(true);
    const caches = charted.filter((e) => e.message.includes("cache")).length;
    const finds = charted.filter((e) => e.message.includes("foraging")).length;
    expect(caches + finds).toBe(REGIONS.length - 1);
    // seed 3 exercises both outcome branches.
    expect(caches).toBeGreaterThan(0);
    expect(finds).toBeGreaterThan(0);
  });

  it("is fully deterministic — same seed yields the same map and the same outcomes", () => {
    const a = scout(3, 4, REGIONS.length);
    const b = scout(3, 4, REGIONS.length);
    expect(a.state.discoveredRegions).toEqual(b.state.discoveredRegions);
    expect(a.state.resources.wood).toBe(b.state.resources.wood);
    expect(a.state.resources.stone).toBe(b.state.resources.stone);
    expect(a.state.resources.hide).toBe(b.state.resources.hide);
    expect(chartLogs(a).map((e) => e.message)).toEqual(chartLogs(b).map((e) => e.message));
  });
});

describe("scouting — player API", () => {
  it("setScouts clamps to a non-negative integer", () => {
    const sim = new Simulation({ seed: 1 });
    sim.setScouts(-5);
    expect(sim.state.scouts).toBe(0);
    sim.setScouts(3.9);
    expect(sim.state.scouts).toBe(3);
  });

  it("survives a save / load round-trip", () => {
    const sim = scout(3, 4, 3);
    const charted = sim.state.discoveredRegions.slice();
    const reloaded = Simulation.load(sim.serialize());
    expect(reloaded.state.discoveredRegions).toEqual(charted);
    expect(reloaded.state.scouts).toBe(sim.state.scouts);
    expect(reloaded.state.scoutProgress).toBe(sim.state.scoutProgress);
  });
});
