import { describe, it, expect } from "vitest";
import { burstForEvent, BURST_STYLE, type FeedbackKind } from "./feedback.js";

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
});
