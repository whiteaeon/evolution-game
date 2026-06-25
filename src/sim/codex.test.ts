import { describe, it, expect } from "vitest";
import { CODEX_ENTRIES, isUnlocked, type CodexContext, type CodexEntry } from "./codex.js";
import { TECH_ORDER } from "./knowledge.js";
import { Simulation } from "./simulation.js";
import { BIOMES, EVENT_CHAINS, LINEAGES } from "./types.js";

const emptyCtx: CodexContext = {
  discoveredTechs: new Set(),
  visitedBiomes: [],
  interbredLineages: [],
  seenEventChains: [],
};

const entryFor = (category: string, id: string): CodexEntry | undefined =>
  CODEX_ENTRIES.find((e) => e.category === category && e.id === id);

describe("codex data", () => {
  it("gives every tech, biome, lineage and event exactly one well-formed entry", () => {
    for (const subjects of [TECH_ORDER, BIOMES, LINEAGES, EVENT_CHAINS]) {
      for (const id of subjects) {
        const matches = CODEX_ENTRIES.filter((e) => e.id === id);
        expect(matches, `entry for ${id}`).toHaveLength(1);
        expect(matches[0].title.length).toBeGreaterThan(0);
        expect(matches[0].lore.length).toBeGreaterThan(0);
      }
    }
  });

  it("has no entries beyond the known subjects", () => {
    const expected = TECH_ORDER.length + BIOMES.length + LINEAGES.length + EVENT_CHAINS.length;
    expect(CODEX_ENTRIES).toHaveLength(expected);
  });

  it("reuses the canonical tech and biome blurbs as their lore", async () => {
    const { TECH_TREE } = await import("./knowledge.js");
    const { BIOME_PROFILE } = await import("./regions.js");
    expect(entryFor("tech", "fire")!.lore).toBe(TECH_TREE.fire.blurb);
    expect(entryFor("biome", "tundra")!.lore).toBe(BIOME_PROFILE.tundra.blurb);
  });
});

describe("codex discovery", () => {
  it("locks every entry when nothing has been encountered", () => {
    for (const e of CODEX_ENTRIES) expect(isUnlocked(e, emptyCtx)).toBe(false);
  });

  it("unlocks an entry only once its subject is discovered", () => {
    expect(isUnlocked(entryFor("tech", "fire")!, { ...emptyCtx, discoveredTechs: new Set(["fire"]) })).toBe(true);
    expect(isUnlocked(entryFor("biome", "forest")!, { ...emptyCtx, visitedBiomes: ["forest"] })).toBe(true);
    expect(isUnlocked(entryFor("lineage", "neanderthal")!, { ...emptyCtx, interbredLineages: ["neanderthal"] })).toBe(true);
    expect(isUnlocked(entryFor("event", "hardWinter")!, { ...emptyCtx, seenEventChains: ["hardWinter"] })).toBe(true);
    // A different subject in the same category stays locked.
    expect(isUnlocked(entryFor("tech", "cooking")!, { ...emptyCtx, discoveredTechs: new Set(["fire"]) })).toBe(false);
  });
});

describe("simulation feeds codex discovery state", () => {
  it("records the starting biome and every biome migrated to", () => {
    const sim = new Simulation({ seed: 3, startRegion: "frostvale" });
    expect(sim.state.totals.biomesVisited).toEqual(["tundra"]);
    sim.migrate("deepwood"); // forest
    sim.migrate("twin-rivers"); // river
    sim.migrate("deepwood"); // forest again — not duplicated
    expect(sim.state.totals.biomesVisited).toEqual(["tundra", "forest", "river"]);
  });

  it("records each event chain the tribe encounters, without duplicates", () => {
    const sim = new Simulation({ seed: 7, startingPopulation: 14 });
    for (let i = 0; i < 400; i++) {
      sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
      if (sim.state.pendingChoice) sim.resolveChoice(0);
      sim.tick();
    }
    const seen = sim.state.totals.eventChainsSeen;
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen).size).toBe(seen.length); // no duplicates
    for (const id of seen) expect(EVENT_CHAINS).toContain(id);
  });
});
