import { describe, it, expect } from "vitest";
import { RNG } from "./rng.js";
import { REGIONS } from "./regions.js";
import { ERAS } from "./types.js";
import { Simulation } from "./simulation.js";
import {
  createRivals,
  evolveRival,
  RIVAL_BALANCE,
  rivalEra,
  type RivalTribe,
} from "./rivals.js";

const inBounds = (r: RivalTribe) => {
  expect(r.population).toBeGreaterThanOrEqual(RIVAL_BALANCE.popFloor);
  expect(r.strength).toBeGreaterThanOrEqual(0);
  expect(r.strength).toBeLessThanOrEqual(1);
  expect(r.disposition).toBeGreaterThanOrEqual(-1);
  expect(r.disposition).toBeLessThanOrEqual(1);
  expect(r.eraIndex).toBeGreaterThanOrEqual(0);
  expect(r.eraIndex).toBeLessThan(ERAS.length);
  expect(r.techProgress).toBeGreaterThanOrEqual(0);
  expect(r.techProgress).toBeLessThan(1);
};

describe("rival creation", () => {
  it("spawns tribes in distinct regions, never the player's start region", () => {
    const start = "frostvale";
    const rivals = createRivals(new RNG(7), start);

    expect(rivals.length).toBe(Math.min(RIVAL_BALANCE.count, REGIONS.length - 1));
    expect(rivals.length).toBeGreaterThan(0);

    const homes = rivals.map((r) => r.homeRegion);
    expect(new Set(homes).size).toBe(homes.length); // distinct
    expect(homes).not.toContain(start); // never the player's home

    for (const r of rivals) {
      expect(REGIONS.some((reg) => reg.id === r.homeRegion)).toBe(true);
      expect(r.biome).toBe(REGIONS.find((reg) => reg.id === r.homeRegion)!.biome);
      expect(r.eraIndex).toBe(0); // everyone starts in the Paleolithic
      inBounds(r);
    }
  });

  it("is deterministic for the same RNG state and start region", () => {
    const a = createRivals(new RNG(99), "deepwood");
    const b = createRivals(new RNG(99), "deepwood");
    expect(a).toEqual(b);
  });

  it("places rivals through the Simulation, away from the player's region", () => {
    const sim = new Simulation({ seed: 3, startRegion: "twin-rivers" });
    expect(sim.state.rivals.length).toBeGreaterThan(0);
    for (const r of sim.state.rivals) expect(r.homeRegion).not.toBe("twin-rivers");
  });
});

describe("rival per-tick evolution", () => {
  it("keeps every field within bounds and never regresses an era over a long run", () => {
    const rng = new RNG(42);
    const rivals = createRivals(rng, "frostvale");
    const eras = rivals.map((r) => r.eraIndex);

    for (let t = 0; t < 4000; t++) {
      rivals.forEach((r, i) => {
        evolveRival(r, rng);
        expect(r.eraIndex).toBeGreaterThanOrEqual(eras[i]); // monotonic
        eras[i] = r.eraIndex;
        inBounds(r);
      });
    }

    // Over thousands of ticks the tribes actually move: they grow/decline and
    // at least one climbs its own tech ladder beyond the Paleolithic.
    expect(rivals.some((r) => r.eraIndex > 0)).toBe(true);
    expect(rivals.every((r) => rivalEra(r) === ERAS[r.eraIndex])).toBe(true);
  });

  it("evolution mutates state — population and disposition drift over time", () => {
    const rng = new RNG(5);
    const [r] = createRivals(rng, "frostvale");
    const before = { pop: r.population, disp: r.disposition };
    for (let t = 0; t < 200; t++) evolveRival(r, rng);
    const moved =
      r.population !== before.pop || r.disposition !== before.disp;
    expect(moved).toBe(true);
  });
});

describe("rival save / load round-trip", () => {
  it("round-trips rivals and resumes their evolution identically", () => {
    const a = new Simulation({ seed: 11, startingPopulation: 12 });
    for (let i = 0; i < 80; i++) a.tick();

    const b = Simulation.load(a.serialize());

    // Identical at the snapshot point.
    expect(b.state.rivals).toEqual(a.state.rivals);

    // And continuing both yields identical rival futures (deterministic resume).
    for (let i = 0; i < 120; i++) {
      a.tick();
      b.tick();
    }
    expect(b.state.rivals).toEqual(a.state.rivals);
  });
});
