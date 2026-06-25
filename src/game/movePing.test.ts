import { describe, it, expect } from "vitest";
import { movePingStyle } from "./movePing.js";

describe("click-to-move ping easing", () => {
  it("starts as a tight, fully-opaque ring that is not yet done", () => {
    const s = movePingStyle(0, 400);
    expect(s.scale).toBeCloseTo(0.6);
    expect(s.alpha).toBeCloseTo(1);
    expect(s.done).toBe(false);
  });

  it("expands outward while fading as it ages", () => {
    const early = movePingStyle(100, 400);
    const late = movePingStyle(300, 400);
    expect(late.scale).toBeGreaterThan(early.scale); // ring widens
    expect(late.alpha).toBeLessThan(early.alpha); // ring fades
  });

  it("finishes faded out and flagged done at its lifetime", () => {
    const s = movePingStyle(400, 400);
    expect(s.alpha).toBeCloseTo(0);
    expect(s.done).toBe(true);
  });

  it("clamps past its lifetime — stays done, never over-expands or goes negative", () => {
    const s = movePingStyle(10_000, 400);
    expect(s.done).toBe(true);
    expect(s.alpha).toBe(0); // never negative opacity
    expect(s.scale).toBeCloseTo(1.5); // never wider than the final ripple
  });
});
