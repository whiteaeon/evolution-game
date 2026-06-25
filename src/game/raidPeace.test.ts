import { describe, it, expect } from "vitest";
import { raidPressed, RAID_PEACE_RELATIONS } from "./raidPeace.js";

describe("raidPressed", () => {
  it("presses a raid at the default (un-courted) relations of 0", () => {
    // A player who never gifts the neighbour still faces the raid threat.
    expect(raidPressed(0)).toBe(true);
  });

  it("presses a raid while relations stay below the friendly band", () => {
    expect(raidPressed(-1)).toBe(true);
    expect(raidPressed(0.2)).toBe(true);
    expect(raidPressed(RAID_PEACE_RELATIONS - 0.01)).toBe(true);
  });

  it("calls off the raid once relations reach friendly", () => {
    // Three gifts (+0.2 each) lift relations to 0.6, past the peace floor.
    expect(raidPressed(RAID_PEACE_RELATIONS)).toBe(false);
    expect(raidPressed(0.6)).toBe(false);
    expect(raidPressed(1)).toBe(false);
  });

  it("keeps the peace floor in the friendly band, above neutral and hostile", () => {
    expect(RAID_PEACE_RELATIONS).toBeGreaterThan(0);
    expect(RAID_PEACE_RELATIONS).toBeLessThanOrEqual(1);
  });
});
