import { describe, it, expect } from "vitest";
import { settlementRosterLine, settlementPopulation } from "./settlements.js";
import { type Settlement, type Individual, type TaskAllocation } from "../sim/index.js";

const NO_WORK: TaskAllocation = { gather: 0, hunt: 0, cook: 0, build: 0, research: 0, idle: 0 };

/** A bare individual carrying only the `alive` flag the roster reads. */
function member(alive: boolean): Individual {
  return { alive } as Individual;
}

function settlement(over: Partial<Settlement> = {}): Settlement {
  return {
    id: "home",
    name: "Frostvale",
    region: "frostvale",
    biome: "tundra",
    shelter: "cave",
    resources: { food: 42.9, materials: 0, buildProgress: 0, wood: 0, stone: 0, hide: 0 },
    members: [member(true), member(true), member(true)],
    allocation: { ...NO_WORK, gather: 3, hunt: 2 },
    ...over,
  };
}

describe("settlementPopulation", () => {
  it("counts only living members (the members array retains the dead)", () => {
    const st = settlement({ members: [member(true), member(false), member(true)] });
    expect(settlementPopulation(st)).toBe(2);
  });
});

describe("settlementRosterLine", () => {
  it("names the seat, biome, living headcount, shelter and floored larder", () => {
    const line = settlementRosterLine(settlement(), true);
    expect(line).toContain("Frostvale (tundra)");
    expect(line).toContain("👥 3");
    expect(line).toContain("🛖 cave");
    expect(line).toContain("🍖 42"); // 42.9 floored
  });

  it("tags the home camp and an outpost differently", () => {
    expect(settlementRosterLine(settlement(), true)).toContain("home");
    expect(settlementRosterLine(settlement(), false)).toContain("outpost");
  });

  it("shows the labour split across only the assigned work tasks", () => {
    const line = settlementRosterLine(settlement(), true);
    // Only gather (3) and hunt (2) are assigned, so the split lists exactly those.
    expect(line).toContain("⚒ g3 h2");
  });

  it("reads 'idle' when no work is assigned", () => {
    const st = settlement({ allocation: { ...NO_WORK } });
    expect(settlementRosterLine(st, true)).toContain("⚒ idle");
  });
});
