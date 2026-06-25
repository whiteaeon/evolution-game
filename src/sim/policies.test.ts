import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import { Policies, POLICY_AXES } from "./policies.js";

/** Run the headless autopilot, optionally adopting policies first, and return the sim. */
function autopilot(
  seed: number,
  ticks: number,
  setup?: (sim: Simulation) => void,
): Simulation {
  const sim = new Simulation({ seed, startingPopulation: 12 });
  setup?.(sim);
  for (let i = 0; i < ticks; i++) {
    sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
    if (sim.state.pendingEncounter) sim.resolveEncounter(true);
    if (sim.state.pendingChoice) sim.resolveChoice(0);
    sim.tick();
    if (sim.state.won || sim.living.length === 0) break;
  }
  return sim;
}

describe("policies — defaults", () => {
  it("starts every axis on its balanced stance, contributing nothing", () => {
    const p = new Policies();
    for (const axis of POLICY_AXES) {
      expect(p.stanceOf(axis.id).id).toBe(axis.stances[0].id);
    }
    expect(p.active()).toEqual([]);
    expect(p.selectionPressure()).toBe(1);

    const e = p.aggregateEffects();
    expect(e.researchMult).toBe(1);
    expect(e.birthMult).toBe(1);
    expect(e.defenseMult).toBe(1);
    expect(e.capacityBonus).toBe(0);
  });

  it("ignores unknown axis or stance ids", () => {
    const p = new Policies();
    p.set("social", "nonesuch");
    p.set("nonesuch", "communal");
    expect(p.stanceOf("social").id).toBe("balanced");
  });
});

describe("policies — each stance's effect", () => {
  it("communal trades individual output for shared research (and gentler selection)", () => {
    const p = new Policies();
    p.set("social", "communal");
    const e = p.aggregateEffects();
    expect(e.researchMult).toBeGreaterThan(1);
    expect(e.foodMult).toBeLessThan(1);
    expect(p.selectionPressure()).toBeLessThan(1);
  });

  it("competitive trades shared research for individual output (and sharper selection)", () => {
    const p = new Policies();
    p.set("social", "competitive");
    const e = p.aggregateEffects();
    expect(e.researchMult).toBeLessThan(1);
    expect(e.foodMult).toBeGreaterThan(1);
    expect(p.selectionPressure()).toBeGreaterThan(1);
  });

  it("expansion trades defence for carrying capacity", () => {
    const p = new Policies();
    p.set("settlement", "expansion");
    const e = p.aggregateEffects();
    expect(e.capacityBonus).toBeGreaterThan(0);
    // defenseMult is a lethality multiplier; >1 means weaker defence
    expect(e.defenseMult).toBeGreaterThan(1);
  });

  it("consolidation trades capacity for defence", () => {
    const p = new Policies();
    p.set("settlement", "consolidation");
    const e = p.aggregateEffects();
    expect(e.capacityBonus).toBeLessThan(0);
    // <1 means better defended
    expect(e.defenseMult).toBeLessThan(1);
  });

  it("combines the two axes' selection pressures multiplicatively", () => {
    const p = new Policies();
    p.set("social", "competitive"); // 1.3
    p.set("settlement", "expansion"); // 1 (settlement axis is pressure-neutral)
    expect(p.selectionPressure()).toBeCloseTo(1.3, 6);
    p.set("social", "communal"); // 0.85
    expect(p.selectionPressure()).toBeCloseTo(0.85, 6);
  });
});

describe("policies — threaded into the sim math", () => {
  it("settlement policy raises/lowers the tribe's carrying capacity", () => {
    const capacityUnder = (stance: string): number => {
      const sim = new Simulation({ seed: 3, startingPopulation: 12 });
      if (stance !== "balanced") sim.setPolicy("settlement", stance);
      const e = sim.state.knowledge.aggregateEffects();
      sim.state.policies.foldInto(e);
      return sim.carryingCapacity(e);
    };
    const balanced = capacityUnder("balanced");
    expect(capacityUnder("expansion")).toBeGreaterThan(balanced);
    expect(capacityUnder("consolidation")).toBeLessThan(balanced);
  });

  it("expansion sustains a larger population than consolidation", () => {
    const exp = autopilot(11, 200, (s) => s.setPolicy("settlement", "expansion"));
    const con = autopilot(11, 200, (s) => s.setPolicy("settlement", "consolidation"));
    expect(exp.state.totals.peakPopulation).toBeGreaterThan(con.state.totals.peakPopulation);
  });

  it("communal out-researches competitive over a run", () => {
    // The social axis trades research against individual output. Aggregate tech
    // discovered across seeds: communal's research bonus should pull ahead of
    // competitive's penalty (a ~22% relative gap that compounds over a run).
    let communal = 0;
    let competitive = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      communal += autopilot(seed, 200, (s) => s.setPolicy("social", "communal"))
        .state.knowledge.discovered.size;
      competitive += autopilot(seed, 200, (s) => s.setPolicy("social", "competitive"))
        .state.knowledge.discovered.size;
    }
    expect(communal).toBeGreaterThan(competitive);
  });
});

describe("policies — persistence", () => {
  it("survives a serialize / deserialize round-trip", () => {
    const sim = new Simulation({ seed: 9, startingPopulation: 12 });
    sim.setPolicy("social", "competitive");
    sim.setPolicy("settlement", "expansion");
    sim.run(5);
    const back = Simulation.load(sim.serialize());
    expect(back.state.policies.stanceOf("social").id).toBe("competitive");
    expect(back.state.policies.stanceOf("settlement").id).toBe("expansion");
    // tolerant of pre-policy saves
    expect(Policies.deserialize(undefined).active()).toEqual([]);
  });
});

describe("policies — completability", () => {
  const within = (sim: Simulation) =>
    sim.state.won && sim.state.tick > 150 && sim.state.tick < 2000;

  it("the autopilot still wins under the all-balanced default", () => {
    expect(within(autopilot(42, 4000))).toBe(true);
  });

  it("the autopilot still wins under every non-default stance", () => {
    const stances: Array<[string, string]> = [
      ["social", "communal"],
      ["social", "competitive"],
      ["settlement", "expansion"],
      ["settlement", "consolidation"],
    ];
    for (const [axis, stance] of stances) {
      const sim = autopilot(42, 4000, (s) => s.setPolicy(axis, stance));
      expect(within(sim), `${axis}=${stance} should still reach the Information Age`).toBe(true);
    }
  });
});
