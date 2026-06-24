import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import {
  initQuests,
  evaluateQuests,
  QUEST_DEFS,
  type QuestContext,
} from "./quests.js";

const baseCtx: QuestContext = {
  tick: 1,
  population: 10,
  hasFire: false,
  lineageCount: 0,
  winterChainsSurvived: 0,
  settlementInNewBiome: false,
};

describe("quest progress + completion + reward (pure)", () => {
  it("tracks progress, latches completion, and reports the reward once", () => {
    const entries = initQuests();
    const reach = entries.find((e) => e.id === "reach30")!;

    // Below target: progress advances, not complete.
    let completed = evaluateQuests(entries, { ...baseCtx, tick: 1, population: 18 });
    expect(reach.progress).toBe(18);
    expect(reach.done).toBe(false);
    expect(completed.map((d) => d.id)).not.toContain("reach30");

    // Crossing the target completes it and clamps progress to the target.
    completed = evaluateQuests(entries, { ...baseCtx, tick: 7, population: 41 });
    expect(reach.done).toBe(true);
    expect(reach.progress).toBe(30);
    expect(reach.completedTick).toBe(7);
    const reachDef = completed.find((d) => d.id === "reach30")!;
    expect(reachDef.reward).toEqual({ materials: 30 });

    // Already done: never reported a second time, progress frozen.
    completed = evaluateQuests(entries, { ...baseCtx, tick: 8, population: 5 });
    expect(completed.map((d) => d.id)).not.toContain("reach30");
    expect(reach.progress).toBe(30);
  });

  it("counts distinct lineages toward the interbreeding quest", () => {
    const entries = initQuests();
    const quest = entries.find((e) => e.id === "interbreedAll")!;
    evaluateQuests(entries, { ...baseCtx, lineageCount: 2 });
    expect(quest.done).toBe(false);
    expect(quest.progress).toBe(2);
    const completed = evaluateQuests(entries, { ...baseCtx, lineageCount: 3 });
    expect(quest.done).toBe(true);
    expect(completed.map((d) => d.id)).toContain("interbreedAll");
  });
});

describe("quest deadlines", () => {
  it("fails the fire quest once its deadline passes", () => {
    const entries = initQuests();
    const fire = entries.find((e) => e.id === "fireBeforeYear30")!;
    evaluateQuests(entries, { ...baseCtx, tick: 20, hasFire: false });
    expect(fire.done).toBe(false);
    expect(fire.failed).toBe(false);
    evaluateQuests(entries, { ...baseCtx, tick: 31, hasFire: false });
    expect(fire.failed).toBe(true);
    expect(fire.done).toBe(false);
  });

  it("completes the fire quest if fire is found before the deadline", () => {
    const entries = initQuests();
    const fire = entries.find((e) => e.id === "fireBeforeYear30")!;
    const completed = evaluateQuests(entries, { ...baseCtx, tick: 12, hasFire: true });
    expect(fire.done).toBe(true);
    expect(completed.map((d) => d.id)).toContain("fireBeforeYear30");
  });
});

describe("quests integrated into the simulation", () => {
  it("completes 'reach30' and pays exactly its reward into the tribe's stores", () => {
    const sim = new Simulation({ seed: 1, startingPopulation: 40 });
    // No builders → the only way materials can change this tick is a quest reward.
    sim.setAllocation("gather", 20);
    sim.setAllocation("research", 10);
    sim.tick();

    const reach = sim.state.quests.find((q) => q.id === "reach30")!;
    expect(sim.living.length).toBeGreaterThanOrEqual(30);
    expect(reach.done).toBe(true);
    expect(sim.state.resources.materials).toBe(30);
  });
});

describe("quest state survives save / load", () => {
  it("round-trips quest progress and the tallies that feed it", () => {
    const a = new Simulation({ seed: 9, startingPopulation: 14 });
    for (let i = 0; i < 120; i++) {
      a.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
      if (a.state.pendingEncounter) a.resolveEncounter(true);
      if (a.state.pendingChoice) a.resolveChoice(0);
      a.tick();
    }

    // At least one quest should have made progress for the round-trip to be meaningful.
    expect(a.state.quests.some((q) => q.done || q.progress > 0)).toBe(true);

    const b = Simulation.load(a.serialize());
    expect(b.state.quests).toEqual(a.state.quests);
    expect(b.state.totals.winterChainsSurvived).toBe(a.state.totals.winterChainsSurvived);
    expect(b.state.totals.lineagesInterbred).toEqual(a.state.totals.lineagesInterbred);

    // And quests keep evaluating identically after a reload.
    for (let i = 0; i < 40; i++) {
      for (const sim of [a, b]) {
        sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
        if (sim.state.pendingEncounter) sim.resolveEncounter(true);
        if (sim.state.pendingChoice) sim.resolveChoice(0);
        sim.tick();
      }
    }
    expect(b.state.quests).toEqual(a.state.quests);
  });
});

describe("quest catalogue", () => {
  it("defines the five objective quests with serialize-safe rewards", () => {
    expect(QUEST_DEFS).toHaveLength(5);
    for (const def of QUEST_DEFS) {
      expect(def.target).toBeGreaterThan(0);
      expect(def.reward.food ?? def.reward.materials).toBeGreaterThan(0);
    }
  });
});
