import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import { REGIONS } from "./regions.js";
import type { Individual } from "./types.js";

/** True iff `people` is in strictly ascending id order. */
function idAscending(people: Individual[]): boolean {
  for (let i = 1; i < people.length; i++) {
    if (people[i].id <= people[i - 1].id) return false;
  }
  return true;
}

describe("id-order invariant (worker distribution relies on it)", () => {
  it("living, state.individuals and every settlement's members stay id-sorted across a long run", () => {
    const sim = new Simulation({ seed: 42, startingPopulation: 12 });
    let founded = false;

    for (let i = 1; i <= 600; i++) {
      sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
      if (sim.state.pendingEncounter) sim.resolveEncounter(true);
      if (sim.state.pendingChoice) sim.resolveChoice(0);
      sim.tick();

      // Exercise distributeForSettlement's pool too: after a short warmup, chart a
      // neighbouring region and spin off a second camp. (Autopilot assigns no
      // scouts, so seed the discovery directly — like the encounter tests do.)
      if (!founded && i >= 40) {
        const other = REGIONS.find((r) => r.id !== sim.state.region)!;
        if (!sim.state.discoveredRegions.includes(other.id)) {
          sim.state.discoveredRegions.push(other.id);
        }
        if (sim.foundSettlement(other.id, 3)) founded = true;
      }

      // The optimization drops a per-tick `[...adults].sort(by id)` because these
      // arrays are only ever appended to with increasing ids — assert that holds.
      expect(idAscending(sim.living)).toBe(true);
      expect(idAscending(sim.state.individuals)).toBe(true);
      for (const st of sim.state.settlements) {
        expect(idAscending(st.members)).toBe(true);
      }

      if (sim.living.length === 0) break;
    }

    expect(founded).toBe(true); // the settlement path was actually exercised
  });
});
