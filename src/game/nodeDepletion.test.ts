import { describe, it, expect } from "vitest";
import { depletionScale } from "./nodeDepletion.js";

describe("depletionScale", () => {
  it("is 1 for a full / untouched node", () => {
    expect(depletionScale(3, 3)).toBe(1);
    expect(depletionScale(12, 12)).toBe(1);
  });

  it("lerps linearly toward minScale as the node empties", () => {
    // init 3: remaining 2 -> frac 2/3, remaining 1 -> frac 1/3.
    expect(depletionScale(2, 3)).toBeCloseTo(0.7 + 0.3 * (2 / 3), 6);
    expect(depletionScale(1, 3)).toBeCloseTo(0.7 + 0.3 * (1 / 3), 6);
  });

  it("never drops below minScale, even at or past empty", () => {
    expect(depletionScale(0, 3)).toBe(0.7);
    expect(depletionScale(-1, 3)).toBe(0.7);
  });

  it("shrinks monotonically as remaining falls", () => {
    const a = depletionScale(11, 12);
    const b = depletionScale(6, 12);
    const c = depletionScale(1, 12);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(c).toBeGreaterThanOrEqual(0.7);
  });

  it("honours a custom minScale", () => {
    expect(depletionScale(0, 4, 0.5)).toBe(0.5);
    expect(depletionScale(2, 4, 0.5)).toBeCloseTo(0.75, 6);
  });

  it("clamps degenerate initial counts to full scale", () => {
    expect(depletionScale(1, 0)).toBe(1);
    expect(depletionScale(5, 5)).toBe(1);
  });
});
