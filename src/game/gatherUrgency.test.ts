import { describe, it, expect } from "vitest";
import { gatherUrgencyPeak } from "./gatherUrgency.js";

const CALM = 0xfff0d0; // a full node's pale peak
const HOT = 0xffa64d; // a near-spent node's amber peak

describe("gather depletion-urgency peak", () => {
  it("sits exactly on the calm peak when the node is full", () => {
    expect(gatherUrgencyPeak(8, 8, CALM, HOT)).toBe(CALM);
  });

  it("sits exactly on the hot peak when the node is empty", () => {
    expect(gatherUrgencyPeak(0, 8, CALM, HOT)).toBe(HOT);
  });

  it("warms monotonically from calm toward hot as the node depletes", () => {
    const full = gatherUrgencyPeak(8, 8, CALM, HOT);
    const half = gatherUrgencyPeak(4, 8, CALM, HOT);
    const last = gatherUrgencyPeak(1, 8, CALM, HOT);
    // The hot tone has a lower green channel than the calm one; green drops as we warm.
    const green = (c: number) => (c >> 8) & 0xff;
    expect(green(full)).toBeGreaterThan(green(half));
    expect(green(half)).toBeGreaterThan(green(last));
  });

  it("reaches the midpoint of each channel at half depletion", () => {
    const mid = gatherUrgencyPeak(4, 8, CALM, HOT);
    const avg = (a: number, b: number, sh: number) =>
      Math.round((((a >> sh) & 0xff) + ((b >> sh) & 0xff)) / 2);
    expect((mid >> 16) & 0xff).toBe(avg(CALM, HOT, 16));
    expect((mid >> 8) & 0xff).toBe(avg(CALM, HOT, 8));
    expect(mid & 0xff).toBe(avg(CALM, HOT, 0));
  });

  it("treats a non-positive init as fully spent rather than calm", () => {
    expect(gatherUrgencyPeak(1, 0, CALM, HOT)).toBe(HOT);
  });

  it("clamps an over-full amount to the calm peak", () => {
    expect(gatherUrgencyPeak(20, 8, CALM, HOT)).toBe(CALM);
  });
});
