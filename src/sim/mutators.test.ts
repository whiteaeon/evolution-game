import { describe, it, expect } from "vitest";
import { Simulation, DEFAULT_CONFIG } from "./simulation.js";
import { MUTATORS, MUTATOR_PRESETS, applyMutators, type MutatorId } from "./mutators.js";

const effects = (sim: Simulation) => sim.state.knowledge.aggregateEffects();

/** Autopilot identical to the headless driver, parameterised by mutators. */
function autoplay(mutators: MutatorId[], seed: number, budget = 4000): Simulation {
  const sim = new Simulation(applyMutators({ seed }, mutators));
  for (let i = 0; i < budget && sim.living.length > 0 && !sim.state.won; i++) {
    sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
    if (sim.state.pendingEncounter) sim.resolveEncounter(true);
    if (sim.state.pendingChoice) sim.resolveChoice(0);
    sim.tick();
  }
  return sim;
}

describe("run mutators", () => {
  it("exposes exactly the five mutators, keyed by id", () => {
    expect(MUTATORS).toEqual([
      "iceAge",
      "harshDisease",
      "abundantGame",
      "fastEras",
      "hostileNeighbours",
    ]);
    for (const m of MUTATORS) expect(MUTATOR_PRESETS[m].id).toBe(m);
  });

  it("no mutators selected leaves the config untouched", () => {
    const base = { seed: 7, startingFood: 25 };
    expect(applyMutators(base, [])).toEqual(base);
  });

  it("each mutator adjusts exactly its own config knob", () => {
    expect(applyMutators({}, ["iceAge"]).baseCold).toBeCloseTo(DEFAULT_CONFIG.baseCold + 0.18);
    expect(applyMutators({}, ["harshDisease"]).diseaseLethality).toBeGreaterThan(1);
    expect(applyMutators({}, ["abundantGame"]).abundanceBonus).toBeGreaterThan(0);
    expect(applyMutators({}, ["fastEras"]).researchMult).toBeGreaterThan(1);
    expect(applyMutators({}, ["hostileNeighbours"]).rivalHostility).toBeGreaterThan(0);
  });

  it("baseCold stays clamped to <= 1 even when iceAge stacks on a cold start", () => {
    expect(applyMutators({ baseCold: 0.95 }, ["iceAge"]).baseCold).toBeLessThanOrEqual(1);
  });

  it("mutators combine cleanly — each knob is set independently", () => {
    const c = applyMutators({}, ["iceAge", "harshDisease", "fastEras"]);
    expect(c.baseCold).toBeCloseTo(DEFAULT_CONFIG.baseCold + 0.18);
    expect(c.diseaseLethality).toBeGreaterThan(1);
    expect(c.researchMult).toBeGreaterThan(1);
    // Untouched knobs remain absent so the sim falls back to its defaults.
    expect(c.abundanceBonus).toBeUndefined();
    expect(c.rivalHostility).toBeUndefined();
  });

  it("harshDisease makes outbreaks deadlier (sim reads the config knob)", () => {
    const plain = new Simulation({ seed: 3 });
    const harsh = new Simulation(applyMutators({ seed: 3 }, ["harshDisease"]));
    expect(harsh.epidemicSeverity(effects(harsh))).toBeGreaterThan(
      plain.epidemicSeverity(effects(plain)),
    );
  });

  it("abundantGame raises world abundance after a tick", () => {
    const plain = new Simulation({ seed: 5 });
    const rich = new Simulation(applyMutators({ seed: 5 }, ["abundantGame"]));
    plain.tick();
    rich.tick();
    expect(rich.state.world.abundance).toBeGreaterThan(plain.state.world.abundance);
  });

  it("fastEras advances the tech tree faster than a plain run", () => {
    const plain = autoplay([], 11, 400);
    const fast = autoplay(["fastEras"], 11, 400);
    expect(fast.state.knowledge.discovered.size).toBeGreaterThan(
      plain.state.knowledge.discovered.size,
    );
  });

  it("hostileNeighbours starts neighbour tribes hostile", () => {
    const friendly = new Simulation({ seed: 9 });
    const hostile = new Simulation(applyMutators({ seed: 9 }, ["hostileNeighbours"]));
    expect(friendly.state.rivals.every((r) => r.relations === 0)).toBe(true);
    expect(hostile.state.rivals.length).toBeGreaterThan(0);
    expect(hostile.state.rivals.every((r) => r.relations < 0)).toBe(true);
  });

  it("a favourable combination stays completable to the Information Age", () => {
    const sim = autoplay(["abundantGame", "fastEras"], 42);
    expect(sim.state.won).toBe(true);
    expect(sim.state.era).toBe("Information");
    expect(sim.state.tick).toBeGreaterThanOrEqual(150);
    expect(sim.state.tick).toBeLessThanOrEqual(2000);
  });

  it("a harsh combination is lethal but still winnable for some seed", () => {
    // Like the difficulty presets: harsh mutators must keep a win *possible*,
    // not guarantee every seed survives.
    const won = Array.from({ length: 12 }, (_, i) =>
      autoplay(["iceAge", "harshDisease", "hostileNeighbours"], i + 1),
    ).some((sim) => sim.state.won);
    expect(won).toBe(true);
  });
});
