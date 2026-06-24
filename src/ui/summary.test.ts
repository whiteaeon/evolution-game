import { describe, it, expect } from "vitest";
import { eraSpans, traitDeltas, summaryHTML, type EndSummary } from "./summary.js";
import type { TraitName } from "../sim/index.js";

describe("eraSpans", () => {
  it("computes years per era, running the last era until endTick", () => {
    const spans = eraSpans(
      [
        { era: "Paleolithic", startTick: 0 },
        { era: "Neolithic", startTick: 40 },
        { era: "Bronze Age", startTick: 90 },
      ],
      120,
    );
    expect(spans).toEqual([
      { era: "Paleolithic", years: 40 },
      { era: "Neolithic", years: 50 },
      { era: "Bronze Age", years: 30 },
    ]);
  });

  it("never returns negative years and handles a single era", () => {
    expect(eraSpans([{ era: "Paleolithic", startTick: 10 }], 5)).toEqual([
      { era: "Paleolithic", years: 0 },
    ]);
  });
});

describe("traitDeltas", () => {
  it("returns final-minus-start for every trait in canonical order", () => {
    const start = {
      strength: 0.5, intelligence: 0.4, dexterity: 0.5,
      coldTolerance: 0.5, diseaseResistance: 0.5, speech: 0.3,
    };
    const final = {
      strength: 0.5, intelligence: 0.7, dexterity: 0.45,
      coldTolerance: 0.5, diseaseResistance: 0.5, speech: 0.6,
    };
    const deltas = traitDeltas(start, final);
    expect(deltas.map((d) => d.trait)).toEqual([
      "strength", "intelligence", "dexterity",
      "coldTolerance", "diseaseResistance", "speech",
    ]);
    const intel = deltas.find((d) => d.trait === "intelligence")!;
    expect(intel.delta).toBeCloseTo(0.3);
    const dex = deltas.find((d) => d.trait === "dexterity")!;
    expect(dex.delta).toBeCloseTo(-0.05);
  });
});

describe("summaryHTML", () => {
  const data: EndSummary = {
    eras: [
      { era: "Paleolithic", years: 40 },
      { era: "Neolithic", years: 60 },
    ],
    traits: [
      { trait: "intelligence" as TraitName, start: 0.4, final: 0.7, delta: 0.3 },
      { trait: "strength" as TraitName, start: 0.5, final: 0.5, delta: 0 },
    ],
    peakPop: 42,
    totals: { births: 100, deaths: 70, interbred: 3 },
    eldest: { age: 61, generation: 5 },
  };

  it("includes the era timeline and trait deltas", () => {
    const html = summaryHTML(data, (t) => t);
    expect(html).toContain("Paleolithic");
    expect(html).toContain("Neolithic");
    expect(html).toContain("40 yr");
    expect(html).toContain("60 yr");
    expect(html).toContain("intelligence");
    expect(html).toContain("0.40 → 0.70");
    expect(html).toContain("+0.30");
    // peak population, totals, and eldest lineage all surfaced
    expect(html).toContain("42");
    expect(html).toContain("100");
    expect(html).toContain("61 yr");
  });

  it("renders without an eldest when none is recorded", () => {
    const html = summaryHTML({ ...data, eldest: null }, (t) => t);
    expect(html).not.toContain("Eldest");
    expect(html).toContain("Era timeline");
  });
});
