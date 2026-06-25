import { describe, it, expect } from "vitest";
import { Simulation, SAVE_VERSION } from "./simulation.js";
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

  it("stamps the current save version and round-trips the newer systems", () => {
    const a = new Simulation({ seed: 3, startingPopulation: 12 });
    for (let i = 0; i < 100; i++) step(a);

    expect(JSON.parse(a.serialize()).version).toBe(SAVE_VERSION);
    expect(a.state.rivals.length).toBeGreaterThan(0); // there is non-default state to round-trip

    const b = Simulation.load(a.serialize());
    expect(b.state.quests).toEqual(a.state.quests);
    expect(b.state.rivals).toEqual(a.state.rivals);
    expect(b.state.resources).toEqual(a.state.resources);
    expect(b.state.culture.points).toBe(a.state.culture.points);
    expect(b.state.discoveredRegions).toEqual(a.state.discoveredRegions);
    expect(b.state.settlements.map((s) => s.id)).toEqual(a.state.settlements.map((s) => s.id));
  });
});

describe("interactive view blob", () => {
  it("round-trips the renderer's opaque view payload", () => {
    const a = new Simulation({ seed: 4, startingPopulation: 12 });
    for (let i = 0; i < 40; i++) step(a);

    // A WorldScene-shaped snapshot: player position, placed buildings, fog reveal,
    // gathered resources and quest state. The sim treats it as opaque data.
    a.view = {
      player: { x: 812, y: 645 },
      gathered: { wood: 7, food: 3, stone: 4 },
      housing: 1,
      farmsBuilt: 1,
      farmHarvests: 2,
      talkedTo: [1, 2, 3],
      regionExplored: { "the eastern ridge": 6 },
      quests: [{ giverId: 1, state: "ready", start: 0 }],
      fog: [0, 1, 2, 17, 18],
      buildings: [
        { kind: "hut", x: 800, y: 600 },
        { kind: "farm", x: 864, y: 600, amount: 9 },
      ],
    };

    const b = Simulation.load(a.serialize());
    expect(b.view).toEqual(a.view);
  });

  it("defaults the view to null when absent (older saves and fresh runs)", () => {
    const fresh = new Simulation({ seed: 8 });
    expect(fresh.view).toBeNull();

    // A save written before the view field existed has no `view` key at all.
    const data = JSON.parse(fresh.serialize());
    delete data.view;
    const loaded = Simulation.load(JSON.stringify(data));
    expect(loaded.view).toBeNull();
  });
});

describe("versioned save migration", () => {
  it("loads a prior-version save, defaulting the newer systems", () => {
    const a = new Simulation({ seed: 7, startingPopulation: 10 });
    for (let i = 0; i < 30; i++) step(a);

    // Forge a v1 save from before quests / rivals / scouting / raw resources.
    const data = JSON.parse(a.serialize());
    delete data.version;
    data.v = 1;
    delete data.state.quests;
    delete data.state.rivals;
    delete data.state.discoveredRegions;
    delete data.state.scouts;
    delete data.state.scoutProgress;
    delete data.state.resources.wood;
    delete data.state.resources.stone;
    delete data.state.resources.hide;

    const b = Simulation.load(JSON.stringify(data));

    expect(b.state.quests.length).toBeGreaterThan(0);
    expect(b.state.quests.every((q) => q.progress === 0 && !q.done && !q.failed)).toBe(true);
    expect(b.state.rivals).toEqual([]);
    expect(b.state.discoveredRegions).toContain(b.state.region);
    expect(b.state.scouts).toBe(0);
    expect(b.state.scoutProgress).toBe(0);
    expect(b.state.resources.wood).toBe(0);
    expect(b.state.resources.stone).toBe(0);
    expect(b.state.resources.hide).toBe(0);

    // The migrated save keeps simulating without crashing, and re-saving stamps v2.
    for (let i = 0; i < 10; i++) step(b);
    expect(b.state.tick).toBeGreaterThan(a.state.tick);
    expect(JSON.parse(b.serialize()).version).toBe(SAVE_VERSION);
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
