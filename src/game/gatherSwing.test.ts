import { describe, it, expect } from "vitest";
import { gatherSwingAngle } from "./gatherSwing.js";

const DUR = 260; // swing length (ms)
const PEAK = 12; // peak lean (deg)

describe("gather body swing arc", () => {
  it("rests upright before the swing starts and once it finishes", () => {
    expect(gatherSwingAngle(0, DUR, PEAK)).toBe(0);
    expect(gatherSwingAngle(DUR, DUR, PEAK)).toBe(0);
    expect(gatherSwingAngle(DUR + 50, DUR, PEAK)).toBe(0);
    expect(gatherSwingAngle(-10, DUR, PEAK)).toBe(0);
  });

  it("reaches the full peak lean at the strike point (30% in)", () => {
    expect(gatherSwingAngle(DUR * 0.3, DUR, PEAK)).toBeCloseTo(PEAK, 6);
  });

  it("never leans past the peak across the whole swing", () => {
    for (let t = 0; t <= DUR; t += 4) {
      const a = gatherSwingAngle(t, DUR, PEAK);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(PEAK + 1e-9);
    }
  });

  it("drives in to the strike, then eases back toward rest", () => {
    const rising = gatherSwingAngle(DUR * 0.15, DUR, PEAK);
    const peak = gatherSwingAngle(DUR * 0.3, DUR, PEAK);
    const falling = gatherSwingAngle(DUR * 0.65, DUR, PEAK);
    expect(rising).toBeLessThan(peak);
    expect(falling).toBeLessThan(peak);
    expect(falling).toBeGreaterThan(0);
  });
});
