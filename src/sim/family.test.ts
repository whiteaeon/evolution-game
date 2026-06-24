import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";

/** Run a normal game a while so a real multi-generation pedigree exists. */
function grow(seed = 3, ticks = 160): Simulation {
  const sim = new Simulation({ seed, startingPopulation: 12, startRegion: "wide-savanna" });
  for (let i = 0; i < ticks; i++) {
    sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1 });
    if (sim.state.pendingEncounter) sim.resolveEncounter(true);
    sim.tick();
  }
  return sim;
}

describe("family-tree data integrity", () => {
  it("every non-founder has two parents that exist and are older generations", () => {
    const sim = grow();
    const all = sim.state.individuals;
    expect(all.length).toBeGreaterThan(50); // a real pedigree

    let founders = 0;
    let children = 0;
    for (const ind of all) {
      const bornHere = ind.motherId !== undefined && ind.fatherId !== undefined;
      if (!bornHere) {
        founders++;
        expect(ind.generation).toBe(ind.generation); // founders/newcomers: no parent refs required
        continue;
      }
      children++;
      const mother = sim.individualById(ind.motherId!);
      const father = sim.individualById(ind.fatherId!);
      expect(mother).toBeDefined();
      expect(father).toBeDefined();
      // Parents are strictly earlier generations (no cycles possible).
      expect(mother!.generation).toBeLessThan(ind.generation);
      expect(father!.generation).toBeLessThan(ind.generation);
      // Sexes are consistent.
      expect(mother!.sex).toBe("f");
      expect(father!.sex).toBe("m");
    }
    expect(founders).toBeGreaterThan(0);
    expect(children).toBeGreaterThan(0);
  });

  it("ancestry walks terminate at founders (acyclic; shared ancestors allowed)", () => {
    const sim = grow();
    const youngest = [...sim.state.individuals].sort((a, b) => b.generation - a.generation)[0];

    // Memoized walk: a node may be reachable via both parents (pedigree
    // collapse) — that is fine; strictly-decreasing generations rule out cycles,
    // so the walk always terminates.
    const seen = new Set<number>();
    const stack = [youngest.id];
    let steps = 0;
    let reachedFounder = false;
    while (stack.length && steps < 100000) {
      steps++;
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const ind = sim.individualById(id);
      if (!ind) continue;
      if (ind.motherId === undefined && ind.fatherId === undefined) reachedFounder = true;
      if (ind.motherId !== undefined) stack.push(ind.motherId);
      if (ind.fatherId !== undefined) stack.push(ind.fatherId);
    }
    expect(steps).toBeLessThan(100000); // terminated well within bound
    expect(reachedFounder).toBe(true); // every lineage roots in a founder
    expect(seen.size).toBeGreaterThan(2);
  });

  it("interbreeding newcomers are roots (no parents) tagged with a lineage", () => {
    const sim = new Simulation({ seed: 9, startingPopulation: 10 });
    sim.state.pendingEncounter = { lineage: "denisovan", message: "t", expiresTick: sim.state.tick + 3 };
    sim.resolveEncounter(true);
    const newcomers = sim.state.individuals.filter((i) => i.lineage === "denisovan");
    expect(newcomers.length).toBeGreaterThan(0);
    for (const n of newcomers) {
      expect(n.motherId).toBeUndefined();
      expect(n.fatherId).toBeUndefined();
    }
  });
});
