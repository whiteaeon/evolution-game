import { describe, it, expect } from "vitest";
import { bonusFromRun, foldLegacy, EMPTY_LEGACY } from "./legacy.js";
import { ERAS } from "../sim/index.js";

describe("roguelite legacy", () => {
  it("derives a small, capped founder bonus from a run's trait averages", () => {
    const bonus = bonusFromRun({
      strength: 0.6, // (0.6-0.4)*0.15 = 0.03
      intelligence: 0.9, // would be 0.075 → capped at 0.06
      dexterity: 0.4, // baseline → 0
      coldTolerance: 0.3, // below baseline → 0
      diseaseResistance: 0.5,
      speech: 0.5,
    });
    expect(bonus.strength).toBeCloseTo(0.03, 5);
    expect(bonus.intelligence).toBe(0.06); // capped
    expect(bonus.dexterity).toBe(0);
    expect(bonus.coldTolerance).toBe(0);
  });

  it("keeps the best era and the best per-trait bonus across runs", () => {
    const run1 = foldLegacy(EMPTY_LEGACY, "Bronze Age", { strength: 0.7, intelligence: 0.5 });
    expect(run1.runs).toBe(1);
    expect(run1.bestEraIndex).toBe(ERAS.indexOf("Bronze Age"));

    // A later run reaches a worse era but evolves intelligence further.
    const run2 = foldLegacy(run1, "Neolithic", { strength: 0.45, intelligence: 0.9 });
    expect(run2.runs).toBe(2);
    expect(run2.bestEraIndex).toBe(ERAS.indexOf("Bronze Age")); // best preserved
    expect(run2.bonus.intelligence).toBe(0.06); // improved & capped
    expect(run2.bonus.strength).toBeCloseTo((0.7 - 0.4) * 0.15, 5); // kept from run1
  });
});
