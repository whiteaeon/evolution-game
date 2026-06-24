import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import { TECH_ORDER, eraCapstone } from "./knowledge.js";
import { ERAS } from "./types.js";

/** Play with the headless autopilot until win, extinction, or the tick budget. */
function autoplay(seed: number, budget = 4000): Simulation {
  const sim = new Simulation({ seed, startingPopulation: 12 });
  for (let i = 0; i < budget && sim.living.length > 0 && !sim.state.won; i++) {
    sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
    if (sim.state.pendingEncounter) sim.resolveEncounter(true);
    sim.tick();
  }
  return sim;
}

describe("the full arc to the Information Age is reachable", () => {
  it("climbs every era and discovers every tech, ending in the Information Age", () => {
    const sim = autoplay(42);

    expect(sim.state.won).toBe(true);
    expect(sim.state.era).toBe("Information");
    // Passed through every era (each era's capstone tech was discovered).
    for (const era of ERAS) {
      const cap = eraCapstone(era);
      if (cap) expect(sim.state.knowledge.has(cap)).toBe(true);
    }
    // Nearly the whole tree was researched to get here (a couple of post-win
    // leaf techs like the Internet unlock only after the final capstone).
    expect(sim.state.knowledge.discovered.size).toBeGreaterThanOrEqual(TECH_ORDER.length - 3);
    // It took many generations of accumulated culture.
    expect(sim.state.generation).toBeGreaterThan(10);
  });

  it("is deterministic: same seed → same winning year", () => {
    expect(autoplay(7).state.tick).toBe(autoplay(7).state.tick);
  });
});
