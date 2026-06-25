import { describe, it, expect } from "vitest";
import { footstepDust, FOOT_SPREAD, FOOT_MIN_SPEED, FOOT_MAX_ALPHA } from "./footstepDust.js";

describe("footstep dust", () => {
  it("raises no dust at a crawl below the speed floor", () => {
    const d = footstepDust(0, FOOT_MIN_SPEED - 1, 142);
    expect(d.emit).toBe(false);
    expect(d.alpha).toBe(0);
  });

  it("kicks brighter dust the faster the stride", () => {
    const slow = footstepDust(0, 80, 142);
    const fast = footstepDust(0, 142, 142);
    expect(slow.emit).toBe(true);
    expect(fast.alpha).toBeGreaterThan(slow.alpha);
  });

  it("reaches full opacity at top speed", () => {
    const d = footstepDust(0, 142, 142);
    expect(d.alpha).toBeCloseTo(FOOT_MAX_ALPHA);
  });

  it("never exceeds max opacity past top speed", () => {
    const d = footstepDust(0, 500, 142);
    expect(d.alpha).toBeCloseTo(FOOT_MAX_ALPHA);
    expect(d.alpha).toBeLessThanOrEqual(FOOT_MAX_ALPHA);
  });

  it("alternates the puff side each planted foot", () => {
    const even = footstepDust(2, 142, 142);
    const odd = footstepDust(3, 142, 142);
    expect(even.offsetX).toBe(FOOT_SPREAD);
    expect(odd.offsetX).toBe(-FOOT_SPREAD);
  });

  it("emits nothing for a zero top speed (no divide-by-zero)", () => {
    const d = footstepDust(0, 0, 0);
    expect(d.emit).toBe(false);
    expect(Number.isFinite(d.alpha)).toBe(true);
  });
});
