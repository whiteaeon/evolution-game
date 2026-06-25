import { describe, it, expect } from "vitest";
import { stepGather } from "./gatherCadence.js";

const RESET = 220;

describe("stepGather", () => {
  it("does not harvest while the key is not held, but still recovers the cooldown", () => {
    const s = stepGather(100, 16, false, RESET);
    expect(s.harvest).toBe(false);
    expect(s.cooldown).toBe(84);
  });

  it("harvests on the frame a held key finds the cooldown ready, and resets it", () => {
    const s = stepGather(0, 16, true, RESET);
    expect(s.harvest).toBe(true);
    expect(s.cooldown).toBe(RESET);
  });

  it("counts a held cooldown down toward zero without harvesting", () => {
    const s = stepGather(RESET, 60, true, RESET);
    expect(s.harvest).toBe(false);
    expect(s.cooldown).toBe(160);
  });

  it("never lets the cooldown fall below zero", () => {
    const s = stepGather(10, 50, false, RESET);
    expect(s.cooldown).toBe(0);
  });

  it("harvests once the cooldown is overdrawn to zero on the same frame while held", () => {
    const s = stepGather(10, 50, true, RESET);
    expect(s.harvest).toBe(true);
    expect(s.cooldown).toBe(RESET);
  });

  it("yields a steady cadence of one harvest per reset window while held", () => {
    // Drive ~half a second of held frames at 60fps and count the swings; the
    // cadence should be roughly 1000ms / (frame + RESET) per swing, not one per frame.
    let cooldown = 0;
    let harvests = 0;
    const dt = 16;
    for (let t = 0; t < 660; t += dt) {
      const s = stepGather(cooldown, dt, true, RESET);
      cooldown = s.cooldown;
      if (s.harvest) harvests++;
    }
    // ~660ms held: an immediate swing plus one per ~(RESET) thereafter ≈ 3 swings.
    expect(harvests).toBeGreaterThanOrEqual(2);
    expect(harvests).toBeLessThanOrEqual(4);
  });
});
