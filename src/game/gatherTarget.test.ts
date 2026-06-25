import { describe, it, expect } from "vitest";
import { pickGatherTarget, type TargetPos } from "./gatherTarget.js";

const nodes: TargetPos[] = [
  { x: 0, y: 0 }, // index 0
  { x: 20, y: 0 }, // index 1
  { x: 200, y: 0 }, // index 2 — far away
];

describe("pickGatherTarget", () => {
  it("returns -1 when no node is within range", () => {
    expect(pickGatherTarget(500, 500, nodes, -1, 34, 8)).toBe(-1);
  });

  it("picks the nearest node when there is no prior target", () => {
    expect(pickGatherTarget(2, 0, nodes, -1, 34, 8)).toBe(0);
    expect(pickGatherTarget(18, 0, nodes, -1, 34, 8)).toBe(1);
  });

  it("keeps the held target until another is closer by more than the stick margin", () => {
    // Player sits at x=12: node 0 is 12px away, node 1 is 8px away.
    // New best (1) beats held target 0 by only 4px (< stick 8), so 0 holds.
    expect(pickGatherTarget(12, 0, nodes, 0, 34, 8)).toBe(0);
    // Drift to x=16: node 1 is 4px, node 0 is 16px — a 12px lead (> stick 8) flips it.
    expect(pickGatherTarget(16, 0, nodes, 0, 34, 8)).toBe(1);
  });

  it("drops a held target once it leaves range and adopts the nearest in range", () => {
    // Held target 2 (x=200) is out of range from x=18; node 1 is nearest.
    expect(pickGatherTarget(18, 0, nodes, 2, 34, 8)).toBe(1);
  });

  it("tolerates a stale prev index that is out of bounds", () => {
    expect(pickGatherTarget(2, 0, nodes, 99, 34, 8)).toBe(0);
  });
});
