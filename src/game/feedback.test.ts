import { describe, it, expect } from "vitest";
import {
  acceptCelebrationCount,
  burstForEvent,
  BURST_STYLE,
  gatherBurstCount,
  GATHER_BURST_BASE,
  questCelebrationCount,
  questRingScale,
  QUEST_RING_SCALE_BASE,
  raidCelebrationCount,
  rallyBurstCount,
  type FeedbackKind,
} from "./feedback.js";

describe("event feedback routing", () => {
  it("routes discoveries and raids to their own burst", () => {
    expect(burstForEvent("discovery", "A flash of insight completes Fire!")).toBe("discovery");
    expect(burstForEvent("raid", "Raiders strike at the settlement.")).toBe("raid");
  });

  it("splits milestones: quest completions sparkle, era milestones glow", () => {
    expect(burstForEvent("milestone", "Quest complete — Firekeeper: tend the hearth.")).toBe("quest");
    expect(burstForEvent("milestone", "The tribe enters the Bronze Age.")).toBe("discovery");
  });

  it("gives ambient events no burst", () => {
    expect(burstForEvent("disease", "An epidemic sweeps the camp.")).toBeNull();
    expect(burstForEvent("encounter", "Interbred with Neanderthals.")).toBeNull();
    expect(burstForEvent("dialogue", "An elder speaks.")).toBeNull();
  });

  it("defines a small, positive, capped style for every feedback kind", () => {
    const kinds: FeedbackKind[] = ["birth", "death", "discovery", "raid", "quest"];
    for (const k of kinds) {
      const s = BURST_STYLE[k];
      expect(s).toBeDefined();
      expect(s.count).toBeGreaterThan(0);
      expect(s.count).toBeLessThanOrEqual(12); // stays tasteful and cheap
    }
  });

  it("swells the quest turn-in burst with the reward, but keeps it capped", () => {
    const base = BURST_STYLE.quest.count;
    expect(questCelebrationCount(0)).toBe(base); // no reward bonus
    expect(questCelebrationCount(12)).toBe(base + 3); // floor(12/4) bonus
    expect(questCelebrationCount(15)).toBeGreaterThan(questCelebrationCount(8)); // fatter payout pops fatter
    expect(questCelebrationCount(1000)).toBeLessThanOrEqual(14); // never floods the scene
  });

  it("blooms the quest turn-in ring wider with the reward, but keeps it capped", () => {
    expect(questRingScale(0)).toBe(QUEST_RING_SCALE_BASE); // no reward bonus → baseline bloom
    expect(questRingScale(12)).toBe(QUEST_RING_SCALE_BASE + 2); // floor(12/6) bonus
    expect(questRingScale(18)).toBeGreaterThan(questRingScale(6)); // a fatter payout blooms wider
    expect(questRingScale(1000)).toBeLessThanOrEqual(9); // never fills the screen
  });

  it("swells the raid-defence burst with the rallied band, but keeps it capped", () => {
    const solo = raidCelebrationCount(true, 1); // chieftain alone, no villagers rallied
    expect(raidCelebrationCount(true, 4)).toBeGreaterThan(solo); // a bigger band pops bigger
    expect(raidCelebrationCount(true, 2)).toBe(solo + 1); // one rallied villager → +1 particle
    expect(raidCelebrationCount(true, 50)).toBeLessThanOrEqual(14); // never floods the scene
  });

  it("makes accepting a quest a subdued promise that the payoff out-celebrates", () => {
    expect(acceptCelebrationCount(0)).toBe(4); // baseline puff, no reward bonus
    expect(acceptCelebrationCount(16)).toBe(6); // floor(16/8) bonus
    expect(acceptCelebrationCount(24)).toBeGreaterThan(acceptCelebrationCount(8)); // a fatter bounty is worth more
    expect(acceptCelebrationCount(1000)).toBeLessThanOrEqual(8); // never floods the scene
    // The promise is always smaller than the payoff for the same reward.
    for (const reward of [0, 8, 12, 40, 1000]) {
      expect(acceptCelebrationCount(reward)).toBeLessThan(questCelebrationCount(reward));
    }
  });

  it("swells the gather burst with the harvest yield, but keeps it capped", () => {
    expect(gatherBurstCount(1)).toBe(GATHER_BURST_BASE); // bare-handed single unit → baseline
    expect(gatherBurstCount(3)).toBe(GATHER_BURST_BASE + 2); // +1 dot per extra unit taken
    expect(gatherBurstCount(5)).toBeGreaterThan(gatherBurstCount(2)); // a fatter swing pops fatter
    expect(gatherBurstCount(100)).toBeLessThanOrEqual(12); // never floods the scene
    expect(gatherBurstCount(0)).toBe(GATHER_BURST_BASE); // never dips below the baseline
  });

  it("swells the rally muster pop as the band grows, but keeps it subdued and capped", () => {
    const first = rallyBurstCount(1); // the first villager mustered → baseline
    expect(first).toBe(5);
    expect(rallyBurstCount(2)).toBe(first + 1); // each extra defender adds one particle
    expect(rallyBurstCount(4)).toBeGreaterThan(rallyBurstCount(2)); // a bigger band pops bigger
    expect(rallyBurstCount(50)).toBeLessThanOrEqual(10); // never floods the scene
    // A single muster stays subtler than a whole defence resolving.
    expect(rallyBurstCount(50)).toBeLessThan(raidCelebrationCount(true, 50));
  });

  it("makes a breach a small, subdued puff regardless of band size", () => {
    expect(raidCelebrationCount(false, 1)).toBe(5);
    expect(raidCelebrationCount(false, 8)).toBe(5); // a loss never celebrates
    expect(raidCelebrationCount(false, 8)).toBeLessThan(raidCelebrationCount(true, 1));
  });
});
