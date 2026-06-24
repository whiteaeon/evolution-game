import { describe, it, expect } from "vitest";
import { RNG } from "./rng.js";
import { inherit, makeGenome } from "./genome.js";
import { TRAITS } from "./types.js";

const parentA = makeGenome(() => 0.2);
const parentB = makeGenome(() => 0.8);

describe("inheritance", () => {
  it("with zero mutation, every gene is exactly one parent's allele", () => {
    const rng = new RNG(123);
    for (let n = 0; n < 200; n++) {
      const child = inherit(parentA, parentB, rng, 0);
      for (const t of TRAITS) {
        expect([0.2, 0.8]).toContain(child[t]);
      }
    }
  });

  it("draws from both parents across many genes (real crossover)", () => {
    const rng = new RNG(7);
    const seen = new Set<number>();
    for (let n = 0; n < 100; n++) {
      const child = inherit(parentA, parentB, rng, 0);
      for (const t of TRAITS) seen.add(child[t]);
    }
    expect(seen.has(0.2)).toBe(true);
    expect(seen.has(0.8)).toBe(true);
  });

  it("is deterministic for a given seed", () => {
    const a = inherit(parentA, parentB, new RNG(99), 0.03);
    const b = inherit(parentA, parentB, new RNG(99), 0.03);
    expect(a).toEqual(b);
  });
});

describe("mutation", () => {
  it("with mutation > 0, offspring genes drift off the parent alleles", () => {
    const rng = new RNG(55);
    let drifted = 0;
    let total = 0;
    for (let n = 0; n < 200; n++) {
      const child = inherit(parentA, parentB, rng, 0.05);
      for (const t of TRAITS) {
        total++;
        if (child[t] !== 0.2 && child[t] !== 0.8) drifted++;
      }
    }
    // Essentially all genes should be mutated off the exact allele.
    expect(drifted / total).toBeGreaterThan(0.95);
  });

  it("keeps genes clamped to [0, 1] even with large mutation", () => {
    const rng = new RNG(3);
    const extreme = makeGenome(() => 0.99);
    for (let n = 0; n < 500; n++) {
      const child = inherit(extreme, extreme, rng, 0.5);
      for (const t of TRAITS) {
        expect(child[t]).toBeGreaterThanOrEqual(0);
        expect(child[t]).toBeLessThanOrEqual(1);
      }
    }
  });
});
