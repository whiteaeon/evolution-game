import { describe, it, expect } from "vitest";
import { nightGlowAlpha } from "./nightGlow.js";

describe("nightGlowAlpha", () => {
  it("skips an off-screen light entirely", () => {
    expect(nightGlowAlpha(false, 0.5, 1, true, 0.9)).toBeNull();
    expect(nightGlowAlpha(false, 0.5, 1, false, 1)).toBeNull();
  });

  it("scales a visible steady light by night depth, ignoring flicker", () => {
    expect(nightGlowAlpha(true, 0.45, 1, false, 0.5)).toBe(0.45);
    expect(nightGlowAlpha(true, 0.45, 0.5, false, 0.5)).toBeCloseTo(0.225);
  });

  it("rides the flicker for a visible fire light", () => {
    expect(nightGlowAlpha(true, 0.5, 1, true, 0.9)).toBeCloseTo(0.45);
    expect(nightGlowAlpha(true, 0.5, 1, true, 1)).toBe(0.5);
  });

  it("goes dark at noon regardless of flicker or visibility margin", () => {
    expect(nightGlowAlpha(true, 0.5, 0, true, 0.9)).toBe(0);
  });
});
