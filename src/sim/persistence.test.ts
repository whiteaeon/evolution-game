import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import { TECH_ORDER } from "./knowledge.js";

const WORK = { gather: 4, hunt: 2, research: 3, cook: 1, build: 1 };

function step(sim: Simulation) {
  sim.autoAllocate(WORK);
  if (sim.state.pendingEncounter) sim.resolveEncounter(true);
  sim.tick();
}

describe("save / load", () => {
  it("round-trips and resumes the RNG identically", () => {
    const a = new Simulation({ seed: 11, startingPopulation: 12 });
    for (let i = 0; i < 70; i++) step(a);

    const snapshot = a.serialize();
    const b = Simulation.load(snapshot);

    // The loaded sim matches the source exactly at the snapshot point.
    expect(b.state.tick).toBe(a.state.tick);
    expect(b.living.length).toBe(a.living.length);
    expect(b.state.resources.food).toBe(a.state.resources.food);
    expect([...b.state.knowledge.discovered].sort()).toEqual([...a.state.knowledge.discovered].sort());

    // And continuing both produces identical futures (deterministic resume).
    for (let i = 0; i < 60; i++) {
      step(a);
      step(b);
    }
    expect(b.state.tick).toBe(a.state.tick);
    expect(b.living.length).toBe(a.living.length);
    expect(b.state.era).toBe(a.state.era);
    expect(b.state.generation).toBe(a.state.generation);
    expect(b.traitAverages().traits.intelligence).toBeCloseTo(
      a.traitAverages().traits.intelligence,
      10,
    );
    for (const t of TECH_ORDER) expect(b.state.knowledge.has(t)).toBe(a.state.knowledge.has(t));
  });

  it("preserves discovered techs and progress through a reload", () => {
    const a = new Simulation({ seed: 2, startingPopulation: 12 });
    for (let i = 0; i < 120; i++) step(a);
    const discovered = [...a.state.knowledge.discovered];

    const b = Simulation.load(a.serialize());
    for (const t of discovered) expect(b.state.knowledge.has(t)).toBe(true);
  });
});

describe("roguelite founder bonus", () => {
  it("config.founderBonus gives the starting tribe a head start", () => {
    const base = new Simulation({ seed: 5 }).traitAverages().traits.strength;
    const boosted = new Simulation({ seed: 5, founderBonus: { strength: 0.2 } }).traitAverages()
      .traits.strength;
    expect(boosted).toBeGreaterThan(base + 0.1);
  });
});
