import { describe, it, expect } from "vitest";
import { questMetric, type QuestMetrics, type QuestSpec } from "./quests.js";

const metrics = (over: Partial<QuestMetrics> = {}): QuestMetrics => ({
  gathered: { wood: 0, food: 0, stone: 0 },
  housing: 0,
  farmsBuilt: 0,
  villagersTalked: 0,
  farmHarvests: 0,
  regionExplored: {},
  ...over,
});

describe("questMetric", () => {
  it("reads the matching resource for gather quests", () => {
    const m = metrics({ gathered: { wood: 7, food: 2, stone: 1 } });
    expect(questMetric({ kind: "gather", res: "wood" }, m)).toBe(7);
    expect(questMetric({ kind: "gather", res: "stone" }, m)).toBe(1);
  });

  it("counts farms vs housing for build quests", () => {
    const m = metrics({ farmsBuilt: 2, housing: 3 });
    expect(questMetric({ kind: "build", build: "farm" }, m)).toBe(2);
    expect(questMetric({ kind: "build", build: "hut" }, m)).toBe(3);
  });

  it("reads the named region's revealed-cell count for explore quests", () => {
    const m = metrics({ regionExplored: { "the eastern ridge": 4 } });
    expect(questMetric({ kind: "explore", region: "the eastern ridge" }, m)).toBe(4);
    // An unexplored (or unknown) region reads as zero, never undefined.
    expect(questMetric({ kind: "explore", region: "nowhere" }, m)).toBe(0);
  });

  it("reads the talk and harvest counters", () => {
    const m = metrics({ villagersTalked: 3, farmHarvests: 5 });
    expect(questMetric({ kind: "talk" }, m)).toBe(3);
    expect(questMetric({ kind: "harvest" }, m)).toBe(5);
  });

  it("progress is the metric minus the accept-time snapshot, for every kind", () => {
    // Accept-time snapshot, then later counters — progress is the delta.
    const specs: QuestSpec[] = [
      { desc: "g", kind: "gather", res: "food", target: 3, reward: { res: "wood", amount: 1 } },
      { desc: "b", kind: "build", build: "farm", target: 1, reward: { res: "wood", amount: 1 } },
      { desc: "e", kind: "explore", region: "r", target: 2, reward: { res: "wood", amount: 1 } },
      { desc: "t", kind: "talk", target: 2, reward: { res: "wood", amount: 1 } },
      { desc: "h", kind: "harvest", target: 2, reward: { res: "wood", amount: 1 } },
    ];
    const before = metrics({
      gathered: { wood: 0, food: 1, stone: 0 },
      villagersTalked: 1,
      regionExplored: { r: 1 },
    });
    const after = metrics({
      gathered: { wood: 0, food: 4, stone: 0 },
      farmsBuilt: 1,
      villagersTalked: 3,
      farmHarvests: 2,
      regionExplored: { r: 3 },
    });
    for (const s of specs) {
      const start = questMetric(s, before);
      const progress = questMetric(s, after) - start;
      expect(progress).toBeGreaterThanOrEqual(s.target);
    }
  });
});
