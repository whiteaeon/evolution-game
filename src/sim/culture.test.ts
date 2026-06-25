import { describe, it, expect } from "vitest";
import { Culture, BELIEF_STAGES } from "./culture.js";
import { Simulation } from "./simulation.js";

describe("culture / belief track", () => {
  it("starts empty and crosses stages as belief accrues", () => {
    const c = new Culture();
    expect(c.points).toBe(0);
    expect(c.level()).toBe(0);
    expect(c.stage()).toBeNull();

    // Accrue just past the first threshold.
    c.accrue(BELIEF_STAGES[0].threshold);
    expect(c.level()).toBe(1);
    expect(c.stage()!.id).toBe(BELIEF_STAGES[0].id);

    // Far enough for every stage.
    c.accrue(BELIEF_STAGES[BELIEF_STAGES.length - 1].threshold);
    expect(c.level()).toBe(BELIEF_STAGES.length);
    expect(c.stage()!.id).toBe(BELIEF_STAGES[BELIEF_STAGES.length - 1].id);
  });

  it("ignores non-positive accrual", () => {
    const c = new Culture();
    c.accrue(-5);
    c.accrue(0);
    expect(c.points).toBe(0);
  });

  it("aggregates each reached stage's effects, compounding like tech", () => {
    const c = new Culture();
    // No stages reached → neutral bundle (mults 1, adds 0).
    const none = c.aggregateEffects();
    expect(none.birthMult).toBe(1);
    expect(none.researchMult).toBe(1);
    expect(none.defenseMult).toBe(1);

    // Reach exactly the first two stages and check their effects compound.
    c.accrue(BELIEF_STAGES[1].threshold);
    expect(c.level()).toBe(2);
    const e = c.aggregateEffects();
    const expectedBirth = (BELIEF_STAGES[0].effects.birthMult ?? 1) * (BELIEF_STAGES[1].effects.birthMult ?? 1);
    const expectedDefense = (BELIEF_STAGES[0].effects.defenseMult ?? 1) * (BELIEF_STAGES[1].effects.defenseMult ?? 1);
    expect(e.birthMult).toBeCloseTo(expectedBirth, 6);
    expect(e.defenseMult).toBeCloseTo(expectedDefense, 6);
  });

  it("folds belief effects into an existing tech-effects bundle without disturbing others", () => {
    const c = new Culture();
    c.accrue(BELIEF_STAGES[0].threshold); // Ancestor Rites: birthMult only
    const e = {
      gatherMult: 1.5, huntMult: 1, foodMult: 1, buildMult: 1, researchMult: 2, birthMult: 1.1,
      defenseMult: 1, diseaseDefense: 0, warmth: 0, capacityBonus: 0, intelPressure: 0, abundance: 0,
    };
    c.foldInto(e);
    // Belief birthMult compounds onto the existing 1.1; untouched fields stay put.
    expect(e.birthMult).toBeCloseTo(1.1 * (BELIEF_STAGES[0].effects.birthMult ?? 1), 6);
    expect(e.gatherMult).toBe(1.5);
    expect(e.researchMult).toBe(2);
  });

  it("survives a serialize / deserialize round-trip", () => {
    const c = new Culture();
    c.accrue(173);
    const back = Culture.deserialize(c.serialize());
    expect(back.points).toBe(173);
    expect(back.level()).toBe(c.level());
    // Tolerates a missing field (pre-belief saves).
    expect(Culture.deserialize(undefined).points).toBe(0);
  });
});

describe("culture in the simulation", () => {
  it("accrues belief from discovered cultural techs over time", () => {
    const sim = new Simulation({ seed: 7, startingPopulation: 10 });
    expect(sim.state.culture.points).toBe(0);

    // No cultural techs yet → no accrual.
    sim.tick();
    expect(sim.state.culture.points).toBe(0);

    // Burial & cave art are culture-category techs; once known, belief accrues.
    sim.state.knowledge.discovered.add("burial");
    sim.state.knowledge.discovered.add("caveArt");
    const before = sim.state.culture.points;
    sim.run(20);
    expect(sim.state.culture.points).toBeGreaterThan(before);
  });

  it("a ritual event chain accrues belief and its cohesion bonus reaches the effects", () => {
    const sim = new Simulation({ seed: 3, startingPopulation: 10 });
    // Push belief to just under the first stage, then resolve a ritual to cross it.
    sim.state.culture.accrue(BELIEF_STAGES[0].threshold - 1);
    sim.state.pendingChoice = {
      id: "prophet",
      title: "t",
      message: "m",
      options: [
        { label: "a", hint: "" },
        { label: "b", hint: "" },
      ],
      expiresTick: sim.state.tick + 6,
    };
    sim.resolveChoice(0); // cautious branch — still a ritual
    expect(sim.state.culture.level()).toBe(1);

    // The first stage's birth cohesion bonus now shows up in the aggregate.
    const e = sim.state.knowledge.aggregateEffects();
    sim.state.culture.foldInto(e);
    expect(e.birthMult).toBeCloseTo(BELIEF_STAGES[0].effects.birthMult ?? 1, 6);
  });

  it("persists the belief track through a save / load", () => {
    const sim = new Simulation({ seed: 9, startingPopulation: 10 });
    sim.state.culture.accrue(222);
    const loaded = Simulation.load(sim.serialize());
    expect(loaded.state.culture.points).toBe(222);
    expect(loaded.state.culture.level()).toBe(sim.state.culture.level());
  });
});
