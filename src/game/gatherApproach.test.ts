import { describe, expect, it } from "vitest";
import { gatherApproach } from "./gatherApproach.js";

describe("gatherApproach", () => {
  it("stops `stop` px out from the node, along the line back to the player", () => {
    const p = gatherApproach({ x: 0, y: 0 }, { x: 100, y: 0 }, 30);
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(70); // 30px short of the node, toward the player
    expect(p!.y).toBeCloseTo(0);
  });

  it("leaves the node exactly `stop` px from the returned point", () => {
    const node = { x: 40, y: 90 };
    const p = gatherApproach({ x: 200, y: 10 }, node, 28)!;
    expect(Math.hypot(p.x - node.x, p.y - node.y)).toBeCloseTo(28);
  });

  it("returns null when the player is already within reach", () => {
    expect(gatherApproach({ x: 10, y: 0 }, { x: 30, y: 0 }, 30)).toBeNull();
  });

  it("returns null at exactly the stop distance (already in range)", () => {
    expect(gatherApproach({ x: 0, y: 0 }, { x: 30, y: 0 }, 30)).toBeNull();
  });

  it("returns null when the player sits on the node (degenerate)", () => {
    expect(gatherApproach({ x: 50, y: 50 }, { x: 50, y: 50 }, 30)).toBeNull();
  });

  it("keeps the approach point on the player's side of the node", () => {
    const p = gatherApproach({ x: -100, y: -100 }, { x: 0, y: 0 }, 20)!;
    expect(p.x).toBeLessThan(0);
    expect(p.y).toBeLessThan(0);
  });
});
