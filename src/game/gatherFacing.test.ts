import { describe, it, expect } from "vitest";
import { gatherFacing } from "./gatherFacing.js";

describe("gatherFacing", () => {
  it("faces right (no flip) for a node clearly to the right", () => {
    expect(gatherFacing(100, 160, 6)).toBe(false);
  });

  it("faces left (flip) for a node clearly to the left", () => {
    expect(gatherFacing(100, 40, 6)).toBe(true);
  });

  it("keeps current facing inside the deadzone", () => {
    expect(gatherFacing(100, 103, 6)).toBeNull();
    expect(gatherFacing(100, 97, 6)).toBeNull();
    expect(gatherFacing(100, 100, 6)).toBeNull();
  });

  it("decides right at the deadzone edge (boundary is inclusive)", () => {
    expect(gatherFacing(100, 106, 6)).toBeNull(); // exactly deadzone away → hold
    expect(gatherFacing(100, 107, 6)).toBe(false); // just past → turn
  });
});
