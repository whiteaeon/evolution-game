import { describe, it, expect } from "vitest";
import { Simulation } from "../sim/simulation.js";
import type { SimState } from "../sim/simulation.js";
import type { Lineage } from "../sim/index.js";
import {
  ACHIEVEMENT_IDS,
  POPULATION_MILESTONE,
  detectAchievements,
  mergeUnlocked,
} from "./achievements.js";

/** A fresh, deterministic sim snapshot to mutate per-case. */
function freshState(): SimState {
  return new Simulation({ seed: 7, startingPopulation: 10 }).state;
}

/** Tag the first `lineages.length` individuals so detection sees that admixture. */
function withLineages(s: SimState, lineages: Lineage[]): SimState {
  lineages.forEach((l, i) => (s.individuals[i].lineage = l));
  return s;
}

describe("detectAchievements", () => {
  it("a fresh Paleolithic tribe has earned nothing", () => {
    expect(detectAchievements(freshState())).toEqual([]);
  });

  it("reaching an era unlocks that era and every earlier one, but not later", () => {
    const s = freshState();
    s.era = "Bronze Age";
    const got = detectAchievements(s);
    expect(got).toContain("neolithic");
    expect(got).toContain("bronze");
    expect(got).not.toContain("classical");
    expect(got).not.toContain("victory");
  });

  it("winning unlocks the victory badge", () => {
    const s = freshState();
    s.won = true;
    expect(detectAchievements(s)).toContain("victory");
  });

  it("Melting Pot needs all three lineages — two is not enough", () => {
    expect(detectAchievements(withLineages(freshState(), ["sapiens", "neanderthal"]))).not.toContain(
      "meltingPot",
    );
    expect(
      detectAchievements(withLineages(freshState(), ["sapiens", "neanderthal", "denisovan"])),
    ).toContain("meltingPot");
  });

  it("Full House requires the population milestone", () => {
    const s = freshState();
    s.totals.peakPopulation = POPULATION_MILESTONE - 1;
    expect(detectAchievements(s)).not.toContain("fullHouse");
    s.totals.peakPopulation = POPULATION_MILESTONE;
    expect(detectAchievements(s)).toContain("fullHouse");
  });

  it("tundraborn needs the Bronze Age, the tundra, and no migration", () => {
    const s = freshState();
    s.era = "Bronze Age";
    s.biome = "tundra";
    s.totals.migrations = 0;
    expect(detectAchievements(s)).toContain("tundraborn");

    s.totals.migrations = 1; // moved at least once
    expect(detectAchievements(s)).not.toContain("tundraborn");

    s.totals.migrations = 0;
    s.biome = "forest"; // left the ice
    expect(detectAchievements(s)).not.toContain("tundraborn");
  });

  it("homebody is a win without migrating", () => {
    const s = freshState();
    s.won = true;
    s.totals.migrations = 0;
    expect(detectAchievements(s)).toContain("homebody");
    s.totals.migrations = 2;
    expect(detectAchievements(s)).not.toContain("homebody");
  });

  it("is pure: it does not mutate the snapshot", () => {
    const s = freshState();
    const before = JSON.stringify(s.totals);
    detectAchievements(s);
    expect(JSON.stringify(s.totals)).toBe(before);
  });
});

describe("mergeUnlocked", () => {
  it("folds newly-earned ids into the previous set", () => {
    const s = freshState();
    s.era = "Neolithic";
    expect(mergeUnlocked([], s)).toEqual(["neolithic"]);
  });

  it("is sticky: an earned badge survives a later regression", () => {
    const won = freshState();
    won.won = true;
    won.era = "Information";
    const unlocked = mergeUnlocked([], won);
    expect(unlocked).toContain("victory");

    // A fresh run (extinct, back in the Paleolithic) keeps the old unlocks.
    const kept = mergeUnlocked(unlocked, freshState());
    expect(kept).toContain("victory");
  });

  it("returns ids in canonical order with no duplicates", () => {
    const s = freshState();
    s.era = "Bronze Age";
    const out = mergeUnlocked(["bronze"], s);
    const order = ACHIEVEMENT_IDS.filter((id) => out.includes(id));
    expect(out).toEqual(order);
    expect(new Set(out).size).toBe(out.length);
  });
});
