import { describe, it, expect } from "vitest";
import { arrivalSpeed } from "./arrival.js";

describe("arrivalSpeed", () => {
  it("holds full speed at or beyond the slow radius", () => {
    expect(arrivalSpeed(48, 142, 48)).toBe(142);
    expect(arrivalSpeed(120, 142, 48)).toBe(142);
  });

  it("scales linearly down toward the destination", () => {
    expect(arrivalSpeed(24, 142, 48)).toBe(71); // halfway in → half speed
    expect(arrivalSpeed(12, 142, 48)).toBe(35.5);
  });

  it("is zero at the destination", () => {
    expect(arrivalSpeed(0, 142, 48)).toBe(0);
    expect(arrivalSpeed(-5, 142, 48)).toBe(0);
  });

  it("never slows when the slow radius is non-positive", () => {
    expect(arrivalSpeed(10, 142, 0)).toBe(142);
    expect(arrivalSpeed(10, 142, -1)).toBe(142);
  });
});
