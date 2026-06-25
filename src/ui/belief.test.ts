import { describe, expect, it } from "vitest";
import { BELIEF_STAGES } from "../sim/index.js";
import { beliefEffectLabel } from "./belief.js";

/** Look a stage up by id so the tests survive reordering of BELIEF_STAGES. */
function stage(id: string) {
  const s = BELIEF_STAGES.find((b) => b.id === id);
  if (!s) throw new Error(`no belief stage ${id}`);
  return s;
}

describe("beliefEffectLabel", () => {
  it("reports a single birth boon", () => {
    // Ancestor Rites: birthMult 1.04 only.
    expect(beliefEffectLabel(stage("ancestorRites"))).toBe("+4% births");
  });

  it("inverts defenseMult so a lower mult reads as more defense", () => {
    // Totems: defenseMult 0.95 (better defended) + birthMult 1.02.
    expect(beliefEffectLabel(stage("totems"))).toBe("+5% defense, +2% births");
  });

  it("reports research and birth boons together", () => {
    // Shamanism: researchMult 1.06 + birthMult 1.03.
    expect(beliefEffectLabel(stage("shamanism"))).toBe("+6% research, +3% births");
  });

  it("lists defense, research and births in display order", () => {
    // Organized Religion: defenseMult 0.94, researchMult 1.05, birthMult 1.04.
    expect(beliefEffectLabel(stage("organizedReligion"))).toBe(
      "+6% defense, +5% research, +4% births",
    );
  });

  it("never emits an empty fragment for any real stage", () => {
    for (const s of BELIEF_STAGES) {
      expect(beliefEffectLabel(s).length).toBeGreaterThan(0);
    }
  });
});
