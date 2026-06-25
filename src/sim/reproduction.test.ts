import { describe, it, expect } from "vitest";
import { fitness } from "./reproduction.js";
import { makeGenome } from "./genome.js";
import { BIOME_PROFILE } from "./regions.js";
import { Knowledge } from "./knowledge.js";
import { BALANCE } from "./balance.js";
import type { Individual } from "./types.js";

/**
 * Direct coverage of {@link fitness}'s intelligence-pressure branch
 * (reproduction.ts): intelligence is selectively *neutral* unless cooked food or
 * schooling is in play. Only `health`, `genome` and `ateCooked` are read, so a
 * minimal stand-in individual is enough.
 */
const indiv = (intelligence: number, ateCooked = false): Individual =>
  ({
    genome: makeGenome((t) => (t === "intelligence" ? intelligence : 0.3)),
    health: 0.5,
    ateCooked,
  }) as unknown as Individual;

// Baseline tech effects with intelPressure 0 (no schooling); grassland rewards
// strength, never intelligence, so intelligence flows only through the branch.
const baseE = new Knowledge().aggregateEffects();
const b = BIOME_PROFILE.grassland;
const cold = 0.3;
const lo = indiv(0.1);
const hi = indiv(0.9);
const intelGap = 0.9 - 0.1;

describe("fitness — intelligence pressure branch", () => {
  it("ignores intelligence with no cooking, cooked meal, or schooling", () => {
    // intelPressure == 0 → the branch is skipped, so two individuals that differ
    // only in intelligence are evolutionarily indistinguishable.
    expect(fitness(lo, baseE, b, cold, false)).toBeCloseTo(
      fitness(hi, baseE, b, cold, false),
      10,
    );
  });

  it("rewards intelligence when cooking is active, by cookingIntelWeight per point", () => {
    const fl = fitness(lo, baseE, b, cold, true);
    const fh = fitness(hi, baseE, b, cold, true);
    expect(fh).toBeGreaterThan(fl);
    expect(fh - fl).toBeCloseTo(intelGap * BALANCE.cookingIntelWeight, 10);
  });

  it("rewards intelligence for an individual who ate cooked food, even if cooking is now off", () => {
    const fl = fitness(indiv(0.1, true), baseE, b, cold, false);
    const fh = fitness(indiv(0.9, true), baseE, b, cold, false);
    expect(fh - fl).toBeCloseTo(intelGap * BALANCE.cookingIntelWeight, 10);
  });

  it("rewards intelligence under schooling pressure (e.intelPressure) with no cooking", () => {
    const school = { ...baseE, intelPressure: 0.6 };
    const fl = fitness(lo, school, b, cold, false);
    const fh = fitness(hi, school, b, cold, false);
    expect(fh - fl).toBeCloseTo(intelGap * 0.6, 10);
  });
});
