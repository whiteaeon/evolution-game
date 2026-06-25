import { describe, it, expect } from "vitest";
import { shouldScanFog } from "./fogScan.js";

describe("shouldScanFog", () => {
  it("skips the scan once the whole map is lifted", () => {
    expect(shouldScanFog(0, 100, 100, 50, 50)).toBe(false);
    // A (defensive) negative remaining is still "nothing left to reveal".
    expect(shouldScanFog(-1, 100, 100, 50, 50)).toBe(false);
  });

  it("always scans the first time, before any position is recorded", () => {
    // NaN sentinel (no scan yet) compares unequal to any real position.
    expect(shouldScanFog(40, 100, 100, Number.NaN, Number.NaN)).toBe(true);
  });

  it("skips a stationary player whose window was already scanned", () => {
    expect(shouldScanFog(40, 100, 100, 100, 100)).toBe(false);
  });

  it("scans again as soon as the player moves on either axis", () => {
    expect(shouldScanFog(40, 101, 100, 100, 100)).toBe(true); // moved in x
    expect(shouldScanFog(40, 100, 101, 100, 100)).toBe(true); // moved in y
    expect(shouldScanFog(40, 100.0001, 100, 100, 100)).toBe(true); // sub-pixel drift counts
  });
});
