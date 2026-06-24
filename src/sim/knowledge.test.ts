import { describe, it, expect } from "vitest";
import { Knowledge } from "./knowledge.js";
import { Simulation } from "./simulation.js";

describe("knowledge / culture", () => {
  it("respects prerequisites", () => {
    const k = new Knowledge();
    expect(k.isUnlocked("stoneTools")).toBe(true);
    expect(k.isUnlocked("fire")).toBe(false); // needs stoneTools
    expect(k.isUnlocked("agriculture")).toBe(false); // needs gathering + cooking

    k.addProgress("stoneTools", 1000);
    expect(k.has("stoneTools")).toBe(true);
    expect(k.isUnlocked("fire")).toBe(true);
  });

  it("derives era from discovered capstones", () => {
    const k = new Knowledge();
    expect(k.currentEra()).toBe("Paleolithic");
    k.discovered.add("agriculture");
    expect(k.currentEra()).toBe("Neolithic");
    k.discovered.add("electricity");
    expect(k.currentEra()).toBe("Modern");
  });

  it("climbs the language chain and compounds research effects", () => {
    const k = new Knowledge();
    expect(k.languageLevel()).toBe(0);
    k.discovered.add("gestures");
    k.discovered.add("symbols");
    expect(k.languageLevel()).toBe(2);
    // research multiplier from those two techs compounds (1.15 * 1.2)
    expect(k.aggregateEffects().researchMult).toBeCloseTo(1.15 * 1.2, 5);
  });

  it("accumulates partial research until a tech completes", () => {
    const k = new Knowledge();
    expect(k.addProgress("stoneTools", 30)).toBeNull();
    expect(k.has("stoneTools")).toBe(false);
    const done = k.addProgress("stoneTools", 40);
    expect(done).toBe("stoneTools");
    expect(k.has("stoneTools")).toBe(true);
  });

  it("persists across the death of every individual who discovered it", () => {
    const sim = new Simulation({ seed: 5, startingPopulation: 6, maxAge: 5 });
    // Force-discover some techs (the "culture").
    sim.state.knowledge.discovered.add("stoneTools");
    sim.state.knowledge.discovered.add("fire");
    const foundersBefore = new Set(sim.living.map((i) => i.id));

    // Run long enough that every founder is dead and a new generation exists.
    sim.setAllocation("gather", 3);
    sim.setAllocation("hunt", 2);
    sim.run(60);

    const survivorsAreFounders = sim.living.some((i) => foundersBefore.has(i.id));
    expect(survivorsAreFounders).toBe(false); // all founders gone

    // Culture survived the people: the tribe still knows fire & tools.
    expect(sim.state.knowledge.has("stoneTools")).toBe(true);
    expect(sim.state.knowledge.has("fire")).toBe(true);
  });
});
