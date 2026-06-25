import { describe, it, expect } from "vitest";
import { RNG } from "./rng.js";
import { REGIONS } from "./regions.js";
import { ERAS } from "./types.js";
import { Simulation } from "./simulation.js";
import {
  createRivals,
  evolveRival,
  shiftRelations,
  resolveSkirmish,
  RIVAL_BALANCE,
  RAID_BALANCE,
  rivalEra,
  type RivalTribe,
  type SkirmishSide,
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
      expect(r.relations).toBe(0); // relations start neutral — only diplomacy moves them
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

describe("rival relations shifts", () => {
  it("moves relations by the delta and is purely additive", () => {
    const [r] = createRivals(new RNG(1), "frostvale");
    expect(r.relations).toBe(0);
    shiftRelations(r, 0.2);
    expect(r.relations).toBeCloseTo(0.2, 10);
    shiftRelations(r, 0.3);
    expect(r.relations).toBeCloseTo(0.5, 10);
    shiftRelations(r, -0.5);
    expect(r.relations).toBeCloseTo(0, 10);
  });

  it("clamps relations to [-1, 1]", () => {
    const [r] = createRivals(new RNG(2), "frostvale");
    shiftRelations(r, 5);
    expect(r.relations).toBe(1);
    shiftRelations(r, -5);
    expect(r.relations).toBe(-1);
    shiftRelations(r, -5);
    expect(r.relations).toBe(-1);
  });

  it("does not touch the rival's intrinsic disposition", () => {
    const [r] = createRivals(new RNG(3), "frostvale");
    const disp = r.disposition;
    shiftRelations(r, 0.4);
    expect(r.disposition).toBe(disp);
  });
});

describe("skirmish resolution", () => {
  const side = (strength: number, population: number, defense: number): SkirmishSide => ({
    strength,
    population,
    defense,
  });

  it("makes both sides take some losses, bounded by maxLossFrac", () => {
    const r = resolveSkirmish(side(0.5, 20, 1.5), side(0.5, 20, 1.5));
    for (const f of [r.attackerLossFrac, r.defenderLossFrac]) {
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThanOrEqual(RAID_BALANCE.maxLossFrac);
    }
    // Evenly matched sides split losses equally, at half the cap.
    expect(r.attackerLossFrac).toBeCloseTo(r.defenderLossFrac, 10);
    expect(r.attackerLossFrac).toBeCloseTo(RAID_BALANCE.maxLossFrac / 2, 10);
  });

  it("lets the stronger side fare better (fewer losses)", () => {
    const out = resolveSkirmish(side(0.9, 20, 1), side(0.2, 20, 1));
    expect(out.attackerPower).toBeGreaterThan(out.defenderPower);
    expect(out.attackerLossFrac).toBeLessThan(out.defenderLossFrac);
  });

  it("lets the more numerous side fare better", () => {
    const out = resolveSkirmish(side(0.5, 40, 1), side(0.5, 10, 1));
    expect(out.attackerLossFrac).toBeLessThan(out.defenderLossFrac);
  });

  it("lets the better-defended side fare better", () => {
    // Defender has stronger defensive tech/shelter; the attacker should suffer more.
    const out = resolveSkirmish(side(0.5, 20, 1), side(0.5, 20, 2.5));
    expect(out.defenderPower).toBeGreaterThan(out.attackerPower);
    expect(out.attackerLossFrac).toBeGreaterThan(out.defenderLossFrac);
  });

  it("is a pure, deterministic function of its inputs", () => {
    const a = resolveSkirmish(side(0.4, 17, 1.3), side(0.7, 23, 1.1));
    const b = resolveSkirmish(side(0.4, 17, 1.3), side(0.7, 23, 1.1));
    expect(a).toEqual(b);
  });

  it("stays finite and bounded against an empty side", () => {
    const r = resolveSkirmish(side(0.5, 10, 1), side(0.5, 0, 1));
    expect(Number.isFinite(r.attackerLossFrac)).toBe(true);
    expect(Number.isFinite(r.defenderLossFrac)).toBe(true);
    // No defender power → the attacker takes ~no losses; the defender takes the cap.
    expect(r.attackerLossFrac).toBeCloseTo(0, 10);
    expect(r.defenderLossFrac).toBeCloseTo(RAID_BALANCE.maxLossFrac, 10);
    // Both sides empty → no losses, still finite (no 0/0).
    const empty = resolveSkirmish(side(0.5, 0, 1), side(0.5, 0, 1));
    expect(empty.attackerLossFrac).toBe(0);
    expect(empty.defenderLossFrac).toBe(0);
  });
});

describe("rival raids in the simulation", () => {
  // Count raids attributable to the given rival names (generic predator raids
  // carry no rival name), scanning the (capped) log fresh after every tick.
  const countRivalRaids = (sim: Simulation, ticks: number, names: string[]): number => {
    let count = 0;
    let lastTick = sim.state.tick;
    for (let i = 0; i < ticks; i++) {
      sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 }); // keep the tribe fed
      sim.tick();
      for (const ev of sim.state.log) {
        if (ev.type === "raid" && ev.tick > lastTick && names.some((n) => ev.message.includes(n)))
          count++;
      }
      lastTick = sim.state.tick;
    }
    return count;
  };

  it("a tribe at peace is never raided by a named rival", () => {
    const sim = new Simulation({ seed: 11, startingPopulation: 14 });
    // Relations start neutral and nothing here resolves diplomacy, so they stay 0.
    for (const r of sim.state.rivals) expect(r.relations).toBe(0);
    const names = sim.state.rivals.map((r) => r.name);
    expect(countRivalRaids(sim, 400, names)).toBe(0);
  });

  it("a rival whose relations have soured raids the tribe", () => {
    const sim = new Simulation({ seed: 11, startingPopulation: 14 });
    const raider = sim.state.rivals[0];
    raider.relations = -1; // sour the relationship past the hostile threshold
    const raids = countRivalRaids(sim, 600, [raider.name]);
    expect(raids).toBeGreaterThan(0);
    // Raiders are bounded — a tribe is never wiped out below its floor.
    expect(raider.population).toBeGreaterThanOrEqual(RIVAL_BALANCE.popFloor);
  });

  it("resolves raids deterministically across a save / load", () => {
    const a = new Simulation({ seed: 7, startingPopulation: 14 });
    a.state.rivals[0].relations = -1;
    const feed = (sim: Simulation) =>
      sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
    for (let i = 0; i < 80; i++) {
      feed(a);
      a.tick();
    }

    const b = Simulation.load(a.serialize());
    expect(b.state.rivals).toEqual(a.state.rivals);
    expect(b.state.log).toEqual(a.state.log);

    for (let i = 0; i < 120; i++) {
      feed(a);
      a.tick();
      feed(b);
      b.tick();
    }
    expect(b.state.rivals).toEqual(a.state.rivals);
    expect(b.state.log).toEqual(a.state.log);
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
