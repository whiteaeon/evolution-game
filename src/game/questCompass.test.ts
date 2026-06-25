import { describe, expect, it } from "vitest";
import { questCompass } from "./questCompass.js";

const VIEW = { x: 0, y: 0, width: 640, height: 360 };

describe("questCompass", () => {
  it("returns null when the target is comfortably on-screen", () => {
    expect(questCompass(320, 180, VIEW, 640, 360, 24)).toBeNull();
  });

  it("returns null right up to the pad inset, then an arrow just past it", () => {
    // pad = 24, so x = 24 is the boundary (still on-screen), x = 23 is outside.
    expect(questCompass(24, 180, VIEW, 640, 360, 24)).toBeNull();
    expect(questCompass(23, 180, VIEW, 640, 360, 24)).not.toBeNull();
  });

  it("clamps a far-right target to the right inset edge, pointing right", () => {
    const m = questCompass(2000, 180, VIEW, 640, 360, 24)!;
    expect(m).not.toBeNull();
    expect(m.x).toBeCloseTo(640 - 24); // right inset edge
    expect(m.y).toBeCloseTo(180); // same height as the camera centre
    expect(m.angle).toBeCloseTo(0); // due right
  });

  it("clamps a target above-left to the top edge, angle in the upper-left", () => {
    const m = questCompass(-100, -100, VIEW, 640, 360, 24)!;
    // Up-and-left of centre → angle between -180 and -90 degrees.
    expect(m.angle).toBeLessThan(-90);
    expect(m.angle).toBeGreaterThan(-180);
    // Marker stays within the inset bounds on both axes.
    expect(m.x).toBeGreaterThanOrEqual(24);
    expect(m.y).toBeGreaterThanOrEqual(24);
  });

  it("keeps the marker inside the inset rectangle for any off-screen target", () => {
    for (const [tx, ty] of [
      [-500, -500],
      [1500, -200],
      [-300, 900],
      [3000, 3000],
    ]) {
      const m = questCompass(tx, ty, VIEW, 640, 360, 24)!;
      expect(m.x).toBeGreaterThanOrEqual(24 - 1e-6);
      expect(m.x).toBeLessThanOrEqual(640 - 24 + 1e-6);
      expect(m.y).toBeGreaterThanOrEqual(24 - 1e-6);
      expect(m.y).toBeLessThanOrEqual(360 - 24 + 1e-6);
    }
  });

  it("accounts for a scrolled camera via the view origin", () => {
    const scrolled = { x: 1000, y: 1000, width: 640, height: 360 };
    // Target sits at the camera centre in world space → on-screen → null.
    expect(questCompass(1320, 1180, scrolled, 640, 360, 24)).toBeNull();
    // Target far below-right of the scrolled view → arrow appears.
    expect(questCompass(5000, 5000, scrolled, 640, 360, 24)).not.toBeNull();
  });
});
