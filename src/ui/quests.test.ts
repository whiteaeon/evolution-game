import { describe, it, expect } from "vitest";
import { rewardText, questLogHTML } from "./quests.js";
import { QUEST_DEFS, initQuests, evaluateQuests, type QuestContext } from "../sim/index.js";

const baseCtx: QuestContext = {
  tick: 0,
  population: 0,
  hasFire: false,
  lineageCount: 0,
  winterChainsSurvived: 0,
  settlementInNewBiome: false,
};

describe("rewardText", () => {
  it("formats food and material rewards", () => {
    expect(rewardText({ food: 20 })).toBe("🍖 20");
    expect(rewardText({ materials: 30 })).toBe("🪵 30");
    expect(rewardText({ food: 5, materials: 7 })).toBe("🍖 5 🪵 7");
    expect(rewardText({})).toBe("");
  });
});

describe("questLogHTML", () => {
  it("renders every quest with its title, description and reward", () => {
    const html = questLogHTML(initQuests(), QUEST_DEFS);
    for (const def of QUEST_DEFS) {
      expect(html).toContain(def.title);
      expect(html).toContain(def.description);
    }
    expect(html).toContain("🪵 30"); // reach30 reward
  });

  it("reflects live progress as a bar width and a count", () => {
    const entries = initQuests();
    evaluateQuests(entries, { ...baseCtx, population: 15 });
    const html = questLogHTML(entries, QUEST_DEFS);
    // reach30: 15/30 → 50% bar and a 15/30 readout.
    expect(html).toContain("width:50%");
    expect(html).toContain("15/30");
    expect(html).toContain('class="quest active"');
  });

  it("exposes each progress bar to assistive tech via ARIA", () => {
    const entries = initQuests();
    evaluateQuests(entries, { ...baseCtx, population: 15 });
    const html = questLogHTML(entries, QUEST_DEFS);
    // reach30: an accessible progressbar reporting 15 of 30.
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="30"');
    expect(html).toContain('aria-valuenow="15"');
  });

  it("marks completed and failed quests distinctly", () => {
    const entries = initQuests();
    // Complete the population quest, fail the fire deadline.
    evaluateQuests(entries, { ...baseCtx, tick: 31, population: 30, hasFire: false });
    const html = questLogHTML(entries, QUEST_DEFS);
    expect(html).toContain('class="quest done"');
    expect(html).toContain('class="quest failed"');
    expect(html).toContain("✓ A growing people");
    expect(html).toContain("✗ Tamers of fire");
  });
});
