import { describe, it, expect } from "vitest";
import { individualName, notableIndividuals, notableById } from "./naming.js";
import { makeGenome } from "./genome.js";
import { Simulation } from "./simulation.js";
import { TRAITS, type Genome, type Individual, type Lineage } from "./types.js";

let nextId = 1;
function person(
  over: Omit<Partial<Individual>, "genome"> & { genome?: Partial<Genome> } = {},
): Individual {
  const genome = makeGenome((t) => over.genome?.[t as keyof Genome] ?? 0.4);
  return {
    id: over.id ?? nextId++,
    genome,
    sex: over.sex ?? "f",
    age: over.age ?? 10,
    generation: over.generation ?? 0,
    motherId: over.motherId,
    fatherId: over.fatherId,
    lineage: over.lineage,
    food: 0.7,
    warmth: 0.7,
    health: 0.8,
    alive: over.alive ?? true,
    ateCooked: false,
  };
}

describe("individualName", () => {
  it("is deterministic for the same individual", () => {
    const ind = person({ id: 42, sex: "m" });
    expect(individualName(ind)).toBe(individualName({ ...ind }));
  });

  it("varies between different ids", () => {
    const names = new Set<string>();
    for (let id = 1; id <= 30; id++) names.add(individualName(person({ id, sex: "f" })));
    // Not asking for perfect uniqueness, just real variation.
    expect(names.size).toBeGreaterThan(10);
  });

  it("differs by sex for the same id (different ending sets)", () => {
    const f = individualName(person({ id: 7, sex: "f" }));
    const m = individualName(person({ id: 7, sex: "m" }));
    expect(f).not.toBe(m);
  });

  it("appends a lineage byname for admixed individuals", () => {
    const base = person({ id: 5, sex: "m" });
    const admixed = person({ id: 5, sex: "m", lineage: "neanderthal" });
    expect(individualName(admixed)).toContain(individualName(base));
    expect(individualName(admixed)).toMatch(/Highlander/);
  });

  it("produces a non-empty capitalised name", () => {
    const name = individualName(person({ id: 99, sex: "f" }));
    expect(name.length).toBeGreaterThan(0);
    expect(name[0]).toBe(name[0].toUpperCase());
  });
});

describe("notableIndividuals", () => {
  it("returns nothing for an empty population", () => {
    expect(notableIndividuals([])).toEqual([]);
  });

  it("flags the longest-lived individual", () => {
    const young = person({ id: 1, age: 5 });
    const old = person({ id: 2, age: 40 });
    const mid = person({ id: 3, age: 20 });
    const eldest = notableIndividuals([young, old, mid]).find((n) => n.kind === "longest-lived");
    expect(eldest?.id).toBe(2);
    expect(eldest?.detail).toContain("40");
  });

  it("flags the individual with the most descendants", () => {
    // gen0 founder 1; children 2,3 of 1; grandchild 4 of 2. 1 has 3 descendants.
    const a = person({ id: 1, generation: 0 });
    const b = person({ id: 2, generation: 1, motherId: 1 });
    const c = person({ id: 3, generation: 1, motherId: 1 });
    const d = person({ id: 4, generation: 2, motherId: 2 });
    const top = notableIndividuals([a, b, c, d]).find((n) => n.kind === "most-descendants");
    expect(top?.id).toBe(1);
    expect(top?.detail).toContain("3");
  });

  it("counts a shared descendant once (pedigree collapse)", () => {
    // 1 and 2 are both parents of 3; 1 should count 3 once, not twice.
    const a = person({ id: 1, generation: 0, sex: "f" });
    const b = person({ id: 2, generation: 0, sex: "m" });
    const c = person({ id: 3, generation: 1, motherId: 1, fatherId: 2 });
    const top = notableIndividuals([a, b, c]).find((n) => n.kind === "most-descendants");
    expect(top?.detail).toContain("1");
  });

  it("omits most-descendants when nobody has children", () => {
    const list = notableIndividuals([person({ id: 1 }), person({ id: 2 })]);
    expect(list.some((n) => n.kind === "most-descendants")).toBe(false);
  });

  it("names a champion for every trait", () => {
    const pop = TRAITS.map((t, i) =>
      person({ id: i + 1, genome: { [t]: 0.95 } as Partial<Genome> }),
    );
    const champs = notableIndividuals(pop).filter((n) => n.kind === "trait-exemplar");
    expect(champs.length).toBe(TRAITS.length);
    // Each trait's champion is the person we boosted that trait on.
    TRAITS.forEach((t, i) => {
      const strongest = [...pop].reduce((a, b) => (b.genome[t] > a.genome[t] ? b : a));
      expect(strongest.id).toBe(i + 1);
    });
  });

  it("labels trait-exemplar detail with a readable trait name, not the raw key", () => {
    const pop = [
      person({ id: 1, genome: { coldTolerance: 0.95 } }),
      person({ id: 2, genome: { diseaseResistance: 0.95 } }),
    ];
    const details = notableIndividuals(pop)
      .filter((n) => n.kind === "trait-exemplar")
      .map((n) => n.detail);
    expect(details).toContain("Cold Tolerance 0.95");
    expect(details).toContain("Disease Resistance 0.95");
    // No internal camelCase identifier leaks into the player-facing detail.
    for (const d of details) expect(d).not.toMatch(/[a-z][A-Z]/);
  });

  it("flags the first arrival of each lineage by lowest id", () => {
    const lineages: Lineage[] = ["neanderthal", "denisovan"];
    const pop: Individual[] = [
      person({ id: 1 }),
      person({ id: 5, lineage: "neanderthal" }),
      person({ id: 3, lineage: "neanderthal" }),
      person({ id: 8, lineage: "denisovan" }),
    ];
    const firsts = notableIndividuals(pop).filter((n) => n.kind === "first-of-lineage");
    expect(firsts.length).toBe(lineages.length);
    const neander = firsts.find((n) => n.detail === "neanderthal");
    expect(neander?.id).toBe(3); // lowest id with that lineage, not 5
  });

  it("breaks ties by lowest id for stability", () => {
    const a = person({ id: 9, age: 30 });
    const b = person({ id: 4, age: 30 });
    const eldest = notableIndividuals([a, b]).find((n) => n.kind === "longest-lived");
    expect(eldest?.id).toBe(4);
  });

  it("works on a real simulated pedigree", () => {
    const sim = new Simulation({ seed: 3, startingPopulation: 12, startRegion: "wide-savanna" });
    for (let i = 0; i < 160; i++) {
      sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1 });
      if (sim.state.pendingEncounter) sim.resolveEncounter(true);
      sim.tick();
    }
    const notable = notableIndividuals(sim.state.individuals);
    expect(notable.length).toBeGreaterThan(0);
    // every notable id is a real individual
    for (const n of notable) {
      expect(sim.individualById(n.id)).toBeDefined();
    }
    // grouping is consistent with the flat list
    const grouped = notableById(sim.state.individuals);
    let total = 0;
    for (const list of grouped.values()) total += list.length;
    expect(total).toBe(notable.length);
  });
});
