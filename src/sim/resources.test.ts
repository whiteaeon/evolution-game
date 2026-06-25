import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import { Knowledge } from "./knowledge.js";
import { TECH_TREE } from "./knowledge.js";

/** Run a sim a few ticks with a fixed allocation, returning it for inspection. */
function runWith(
  alloc: Record<string, number>,
  region: string,
  ticks: number,
): Simulation {
  const sim = new Simulation({ seed: 7, startingPopulation: 16, startRegion: region });
  for (const [task, n] of Object.entries(alloc)) sim.setAllocation(task as never, n);
  for (let i = 0; i < ticks; i++) {
    // Re-assert allocation each tick (population changes don't matter here).
    for (const [task, n] of Object.entries(alloc)) sim.setAllocation(task as never, n);
    sim.tick();
  }
  return sim;
}

describe("carryable resources — production", () => {
  it("builders gather wood and stone; hunters gather hide", () => {
    const builders = runWith({ build: 12 }, "deepwood", 5); // forest: high wood
    expect(builders.state.resources.wood).toBeGreaterThan(0);
    expect(builders.state.resources.stone).toBeGreaterThan(0);

    const hunters = runWith({ hunt: 12 }, "wide-savanna", 5); // grassland: high hide
    expect(hunters.state.resources.hide).toBeGreaterThan(0);
  });

  it("with no workers assigned, no raw resources are produced", () => {
    const idle = runWith({}, "deepwood", 5);
    expect(idle.state.resources.wood).toBe(0);
    expect(idle.state.resources.stone).toBe(0);
    expect(idle.state.resources.hide).toBe(0);
  });

  it("respects per-biome availability (forest yields more wood than tundra)", () => {
    const forest = runWith({ build: 12 }, "deepwood", 5); // forest wood 1.4
    const tundra = runWith({ build: 12 }, "frostvale", 5); // tundra wood 0.4
    expect(forest.state.resources.wood).toBeGreaterThan(tundra.state.resources.wood);
    // …but tundra (stone 1.2) out-quarries the forest (stone 0.6).
    expect(tundra.state.resources.stone).toBeGreaterThan(forest.state.resources.stone);
  });
});

describe("carryable resources — shelter gating", () => {
  function readyToBuildHut(): Simulation {
    const sim = new Simulation({ seed: 1, startingPopulation: 10 });
    // No workers, so a tick produces nothing — isolating the build gate.
    sim.state.resources.buildProgress = 1000; // ample labor
    return sim;
  }

  it("does not upgrade the shelter without the raw materials, even with ample labor", () => {
    const sim = readyToBuildHut();
    sim.state.resources.wood = 0;
    sim.state.resources.stone = 0;
    sim.state.resources.hide = 0;
    sim.tick();
    expect(sim.state.shelter).toBe("cave");
    // Labor is not spent while the build is blocked on materials.
    expect(sim.state.resources.buildProgress).toBeGreaterThanOrEqual(1000 - 1e-9);
  });

  it("upgrades to a hut once wood/stone/hide are in hand, consuming them", () => {
    const sim = readyToBuildHut();
    sim.state.resources.wood = 100;
    sim.state.resources.stone = 100;
    sim.state.resources.hide = 100;
    sim.tick();
    expect(sim.state.shelter).toBe("hut");
    // The hut's bill (wood 16, stone 4, hide 4) was deducted.
    expect(sim.state.resources.wood).toBe(84);
    expect(sim.state.resources.stone).toBe(96);
    expect(sim.state.resources.hide).toBe(96);
  });
});

describe("carryable resources — tech gating", () => {
  it("Knowledge.addProgress parks a tech at its cost until ready, then completes", () => {
    const k = new Knowledge();
    // stoneTools has no prereqs and is immediately unlocked.
    const cost = TECH_TREE.stoneTools.cost;
    expect(k.addProgress("stoneTools", cost + 50, false)).toBeNull();
    expect(k.has("stoneTools")).toBe(false);
    expect(k.progress.stoneTools).toBe(cost); // parked exactly at the cost
    // One more push with the gate open completes it.
    expect(k.addProgress("stoneTools", 1, true)).toBe("stoneTools");
    expect(k.has("stoneTools")).toBe(true);
  });

  it("a resource-gated tech (bronzeworking) will not complete without its stone", () => {
    const sim = new Simulation({ seed: 1, startingPopulation: 16 });
    const k = sim.state.knowledge;
    // Satisfy bronzeworking's direct prereqs so it is researchable.
    k.discovered.add("pottery");
    k.discovered.add("animalDomestication");
    sim.setResearchTarget("bronzeworking");
    // Park research at the cost with no stone in stock.
    k.addProgress("bronzeworking", TECH_TREE.bronzeworking.cost, false);
    sim.state.resources.stone = 0;
    sim.setAllocation("research", 12);
    sim.tick();
    expect(k.has("bronzeworking")).toBe(false);

    // Provide the stone; the next research tick completes it and spends the stone.
    sim.state.resources.stone = 50;
    sim.setAllocation("research", 12);
    sim.tick();
    expect(k.has("bronzeworking")).toBe(true);
    expect(sim.state.resources.stone).toBe(50 - TECH_TREE.bronzeworking.resourceCost!.stone!);
  });
});
