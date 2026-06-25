import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import type { WorldState } from "./types.js";

/**
 * Drive a fresh sim through one full year and capture world conditions at each
 * season. The first four ticks land on seasonIndex 1,2,3,0 — early enough that no
 * tech has been researched, so cold/abundance come purely from the seasonal swing.
 */
function yearByseason(seed: number): Record<number, WorldState> {
  const sim = new Simulation({ seed, startingPopulation: 12 });
  const byIndex: Record<number, WorldState> = {};
  for (let i = 0; i < 4; i++) {
    sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
    sim.tick();
    byIndex[sim.state.world.seasonIndex] = { ...sim.state.world };
  }
  return byIndex;
}

describe("seasonal swing", () => {
  it("makes winter the coldest, leanest season and summer the warmest, richest", () => {
    const s = yearByseason(42);
    const winter = s[0];
    const spring = s[1];
    const summer = s[2];
    const autumn = s[3];

    // Winter is the joint extreme: coldest and leanest of the four seasons.
    expect(winter.cold).toBeGreaterThan(summer.cold);
    expect(winter.cold).toBeGreaterThan(spring.cold);
    expect(winter.cold).toBeGreaterThan(autumn.cold);
    expect(winter.abundance).toBeLessThan(summer.abundance);
    expect(winter.abundance).toBeLessThan(spring.abundance);
    expect(winter.abundance).toBeLessThan(autumn.abundance);

    // Summer is the opposite extreme: warmest and richest.
    expect(summer.cold).toBeLessThan(spring.cold);
    expect(summer.cold).toBeLessThan(autumn.cold);
    expect(summer.abundance).toBeGreaterThan(spring.abundance);
    expect(summer.abundance).toBeGreaterThan(autumn.abundance);

    // Cold and abundance move together (anti-phased): food is leanest exactly when
    // the cold bites hardest, so winter genuinely tightens both food and survival.
    expect(spring.abundance).toBeGreaterThan(winter.abundance);
    expect(summer.abundance).toBeGreaterThan(spring.abundance);
  });

  it("swings deep enough that the season meaningfully changes food and cold", () => {
    const s = yearByseason(7);
    const winter = s[0];
    const summer = s[2];

    // Summer food output is at least half again winter's — a window worth storing for.
    expect(summer.abundance).toBeGreaterThanOrEqual(winter.abundance * 1.5);
    // Cold swings by a large, survival-relevant margin across the year.
    expect(winter.cold - summer.cold).toBeGreaterThanOrEqual(0.4);
  });

  it("keeps the autopilot able to reach the Information Age in a sane span", () => {
    const sim = new Simulation({ seed: 42, startingPopulation: 12 });
    let years = 0;
    for (let i = 1; i <= 4000; i++) {
      sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
      if (sim.state.pendingEncounter) sim.resolveEncounter(true);
      if (sim.state.pendingChoice) sim.resolveChoice(0);
      sim.tick();
      if (sim.state.won) {
        years = sim.state.tick;
        break;
      }
      if (sim.living.length === 0) break;
    }
    expect(years).toBeGreaterThan(150);
    expect(years).toBeLessThan(2000);
  });
});
