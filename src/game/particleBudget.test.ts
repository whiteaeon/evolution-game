import { describe, it, expect } from "vitest";
import { particleBudget } from "./particleBudget.js";

describe("particleBudget", () => {
  it("grants the full request when well under the cap", () => {
    expect(particleBudget(0, 7, 60)).toBe(7);
    expect(particleBudget(20, 12, 60)).toBe(12);
  });

  it("trims a burst that would overshoot the cap to the remaining headroom", () => {
    expect(particleBudget(55, 12, 60)).toBe(5);
    expect(particleBudget(59, 7, 60)).toBe(1);
  });

  it("grants nothing once the cap is reached or exceeded", () => {
    expect(particleBudget(60, 7, 60)).toBe(0);
    expect(particleBudget(80, 12, 60)).toBe(0);
  });

  it("never returns a negative count", () => {
    expect(particleBudget(100, 7, 60)).toBeGreaterThanOrEqual(0);
  });

  it("recovers the full budget once the live count is reset to a clean slate", () => {
    // A leaked active count (e.g. left high after a scene restart killed the
    // in-flight tweens before their onComplete decrements ran) starves every
    // future burst; resetting the count back to 0 restores the full headroom.
    expect(particleBudget(90, 7, 90)).toBe(0); // leaked at the cap → no bursts
    expect(particleBudget(0, 7, 90)).toBe(7); // reset to 0 → full burst again
  });
});
