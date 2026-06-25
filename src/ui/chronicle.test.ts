import { describe, it, expect } from "vitest";
import { Simulation, individualName, type SimEvent } from "../sim/index.js";
import {
  chronicleFigures,
  chronicleYears,
  composeChronicle,
  chronicleHTML,
} from "./chronicle.js";

/** Run a normal game a while so a real log + multi-generation pedigree exists. */
function grow(seed = 5, ticks = 200): Simulation {
  const sim = new Simulation({ seed, startingPopulation: 12, startRegion: "wide-savanna" });
  for (let i = 0; i < ticks; i++) {
    sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1 });
    if (sim.state.pendingEncounter) sim.resolveEncounter(true);
    sim.tick();
  }
  return sim;
}

const log = (...evs: Array<[SimEvent["type"], number, string]>): SimEvent[] =>
  evs.map(([type, tick, message]) => ({ type, tick, message }));

describe("chronicleYears", () => {
  it("returns no entries for an empty log", () => {
    expect(chronicleYears([])).toEqual([]);
  });

  it("weaves events of the same year into one passage, oldest first", () => {
    const entries = chronicleYears(
      log(
        ["disease", 12, "A sickness sweeps the camp."],
        ["choice", 12, "The tribe tends its sick back to health."],
        ["milestone", 4, "The tribe builds a hut."],
      ),
    );
    expect(entries.map((e) => e.year)).toEqual([4, 12]);
    expect(entries[1].prose).toBe(
      "A sickness sweeps the camp. The tribe tends its sick back to health.",
    );
  });

  it("styles a multi-event year by its most salient kind (milestone over disease)", () => {
    const [entry] = chronicleYears(
      log(
        ["disease", 7, "A sickness sweeps the camp."],
        ["milestone", 7, "The tribe builds a village."],
      ),
    );
    expect(entry.kind).toBe("milestone");
  });

  it("reads coherently from a real run: every entry has a year and non-empty prose", () => {
    const sim = grow();
    const entries = chronicleYears(sim.state.log);
    expect(entries.length).toBeGreaterThan(0);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].year).toBeGreaterThanOrEqual(entries[i - 1].year); // chronological
    }
    for (const e of entries) {
      expect(Number.isFinite(e.year)).toBe(true);
      expect(e.prose.length).toBeGreaterThan(0);
    }
  });
});

describe("chronicleFigures", () => {
  it("returns no figures for an empty population", () => {
    expect(chronicleFigures([])).toEqual([]);
  });

  it("names each notable figure using the procedural namer", () => {
    const sim = grow();
    const figures = chronicleFigures(sim.state.individuals);
    expect(figures.length).toBeGreaterThan(0);
    const byId = new Map(sim.state.individuals.map((i) => [i.id, i]));
    for (const f of figures) {
      expect(f.name).toBe(individualName(byId.get(f.id)!));
      expect(f.title.length).toBeGreaterThan(0);
    }
  });
});

describe("chronicleHTML", () => {
  it("renders the empty-state line when nothing has happened", () => {
    const html = chronicleHTML(composeChronicle([], []));
    expect(html).toContain("yet to be written");
  });

  it("renders figure names, year stamps and prose from a real run", () => {
    const sim = grow();
    const chronicle = composeChronicle(sim.state.log, sim.state.individuals);
    const html = chronicleHTML(chronicle);
    expect(html).toContain(chronicle.figures[0].name);
    expect(html).toContain(`Year ${chronicle.entries[0].year}`);
    expect(html).toContain(chronicle.entries[0].prose);
  });
});
