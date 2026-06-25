import { describe, it, expect } from "vitest";
import { raidPressed, raidThreatLabel, RAID_PEACE_RELATIONS } from "./raidPeace.js";

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

describe("raidThreatLabel", () => {
  it("warns of a raid while relations stay below the friendly band", () => {
    // Default (un-courted) and partway-warmed neighbours still threaten a raid.
    expect(raidThreatLabel(0)).toBe("⚔ may raid");
    expect(raidThreatLabel(-1)).toBe("⚔ may raid");
    expect(raidThreatLabel(RAID_PEACE_RELATIONS - 0.01)).toBe("⚔ may raid");
  });

  it("reads peace once relations reach the friendly band", () => {
    expect(raidThreatLabel(RAID_PEACE_RELATIONS)).toBe("🕊 at peace");
    expect(raidThreatLabel(1)).toBe("🕊 at peace");
  });

  it("flips exactly with raidPressed — one source of truth", () => {
    for (const rel of [-1, -0.5, 0, 0.49, 0.5, 0.6, 1]) {
      expect(raidThreatLabel(rel) === "⚔ may raid").toBe(raidPressed(rel));
    }
  });
});
