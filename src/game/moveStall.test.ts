import { describe, it, expect } from "vitest";
import { freshStall, stepStall, MOVE_STALL_MS, MOVE_PROGRESS_EPS } from "./moveStall.js";

describe("moveStall", () => {
  it("never gives up while the mover keeps closing the gap", () => {
    let t = freshStall(200);
    // Approach steadily, one frame at a time, well past the stall window.
    for (let dist = 196; dist > 0; dist -= 4) {
      const r = stepStall(t, dist, 16);
      expect(r.giveUp).toBe(false);
      t = r.tracker;
    }
    expect(t.bestDist).toBeLessThanOrEqual(4);
  });

  it("gives up after the stall window when the gap never improves", () => {
    // Orbiting an unreachable click: distance hovers around a fixed closest pass.
    let t = freshStall(30);
    let gaveUp = false;
    let elapsed = 0;
    const orbit = [30, 31, 30.4, 30.2, 31.5, 30.1];
    for (let i = 0; i < 200 && !gaveUp; i++) {
      const r = stepStall(t, orbit[i % orbit.length], 16);
      t = r.tracker;
      gaveUp = r.giveUp;
      elapsed += 16;
    }
    expect(gaveUp).toBe(true);
    // It should hold on for roughly the stall window, not bail instantly.
    expect(elapsed).toBeGreaterThanOrEqual(MOVE_STALL_MS);
    expect(elapsed).toBeLessThan(MOVE_STALL_MS + 64);
  });

  it("resets the timer when fresh progress finally arrives", () => {
    let t = freshStall(50);
    // Stall almost to the limit...
    let r = stepStall(t, 50, MOVE_STALL_MS - 16);
    expect(r.giveUp).toBe(false);
    // ...then a real step closer wipes the accumulated stall.
    r = stepStall(r.tracker, 50 - MOVE_PROGRESS_EPS - 1, 16);
    expect(r.giveUp).toBe(false);
    expect(r.tracker.stalledMs).toBe(0);
    expect(r.tracker.bestDist).toBe(50 - MOVE_PROGRESS_EPS - 1);
  });

  it("tracks the closest pass even when progress is too small to reset the timer", () => {
    let t = freshStall(40);
    const r1 = stepStall(t, 39.9, 16); // sub-epsilon: counts toward best, not reset
    expect(r1.giveUp).toBe(false);
    expect(r1.tracker.bestDist).toBe(39.9);
    expect(r1.tracker.stalledMs).toBe(16);
  });
});
