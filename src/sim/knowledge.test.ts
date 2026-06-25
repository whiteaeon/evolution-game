import { describe, it, expect } from "vitest";
import { Knowledge, TECH_ORDER, TECH_TREE } from "./knowledge.js";
import { pickResearchTarget } from "./production.js";
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

  it("memoizes aggregateEffects but reflects newly discovered techs", () => {
    const k = new Knowledge();
    const base = k.aggregateEffects();
    expect(base.researchMult).toBeCloseTo(1, 5);

    // A fresh object is returned each call (so callers can mutate it safely),
    // yet repeated calls on an unchanged set carry identical values.
    const again = k.aggregateEffects();
    expect(again).not.toBe(base);
    expect(again).toEqual(base);
    again.researchMult = 99; // mutating a returned copy must not poison the cache
    expect(k.aggregateEffects().researchMult).toBeCloseTo(1, 5);

    // Direct adds (not via addProgress) still invalidate via the size key.
    k.discovered.add("gestures");
    expect(k.aggregateEffects().researchMult).toBeCloseTo(1.15, 5);
    k.discovered.add("caveArt");
    expect(k.aggregateEffects().researchMult).toBeCloseTo(1.15 * 1.1, 5);

    // Completion via addProgress also invalidates.
    k.addProgress("stoneTools", 1000);
    expect(k.aggregateEffects().gatherMult).toBeCloseTo(1.15, 5);
  });

  it("accumulates partial research until a tech completes", () => {
    const k = new Knowledge();
    expect(k.addProgress("stoneTools", 30)).toBeNull();
    expect(k.has("stoneTools")).toBe(false);
    const done = k.addProgress("stoneTools", 40);
    expect(done).toBe("stoneTools");
    expect(k.has("stoneTools")).toBe(true);
  });

  it("picks the earliest researchable tech (== available()[0]) as it discovers more", () => {
    const sim = new Simulation({ seed: 3 });
    const k = sim.state.knowledge;
    // Across many discovery states, the picked target must equal the earliest
    // unlocked tech in TECH_ORDER — i.e. available()[0] — which is exactly what
    // the optimized pickResearchTarget short-circuits to.
    const earliestUnlocked = () => TECH_ORDER.find((t) => k.isUnlocked(t)) ?? null;
    for (let i = 0; i < TECH_ORDER.length; i++) {
      expect(pickResearchTarget(sim.state)).toBe(earliestUnlocked());
      expect(pickResearchTarget(sim.state)).toBe(k.available()[0] ?? null);
      const next = earliestUnlocked();
      if (!next) break;
      k.discovered.add(next);
    }
    // Everything discovered → nothing left to research.
    expect(pickResearchTarget(sim.state)).toBeNull();
  });

  it("fundResearch completes the chosen target and advances the era", () => {
    const sim = new Simulation({ seed: 9, startingPopulation: 16 });
    const k = sim.state.knowledge;

    // A short push only accrues; it does not complete the tech.
    sim.setResearchTarget("stoneTools");
    expect(sim.fundResearch(TECH_TREE.stoneTools.cost - 1)).toBeNull();
    expect(k.has("stoneTools")).toBe(false);
    // One more point of insight tips it over → it is discovered and returned.
    expect(sim.fundResearch(1)).toBe("stoneTools");
    expect(k.has("stoneTools")).toBe(true);

    // Drive the chain to a capstone; funding it advances state.era in step.
    for (const t of ["gathering", "fire", "cooking", "gestures"] as const) {
      sim.setResearchTarget(t);
      sim.fundResearch(TECH_TREE[t].cost);
    }
    expect(sim.state.era).toBe("Paleolithic");
    sim.setResearchTarget("agriculture");
    expect(sim.fundResearch(TECH_TREE.agriculture.cost)).toBe("agriculture");
    expect(sim.state.era).toBe("Neolithic");
  });

  it("fundResearch honours a resource-gated tech's raw-material bill", () => {
    const sim = new Simulation({ seed: 11, startingPopulation: 16 });
    const k = sim.state.knowledge;
    k.discovered.add("pottery");
    k.discovered.add("animalDomestication");
    sim.setResearchTarget("bronzeworking");

    // Fully fund it, but with no stone in stock it parks at the cost.
    sim.state.resources.stone = 0;
    expect(sim.fundResearch(TECH_TREE.bronzeworking.cost)).toBeNull();
    expect(k.has("bronzeworking")).toBe(false);

    // Provide the stone; the next push completes it and spends the bill.
    sim.state.resources.stone = 50;
    expect(sim.fundResearch(TECH_TREE.bronzeworking.cost)).toBe("bronzeworking");
    expect(k.has("bronzeworking")).toBe(true);
    expect(sim.state.resources.stone).toBe(50 - TECH_TREE.bronzeworking.resourceCost!.stone!);
  });

  it("fundResearch returns null once the whole tree is known", () => {
    const sim = new Simulation({ seed: 13, startingPopulation: 16 });
    for (const t of TECH_ORDER) sim.state.knowledge.discovered.add(t);
    sim.setResearchTarget(null);
    expect(sim.fundResearch(1000)).toBeNull();
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
