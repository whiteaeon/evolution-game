import { describe, it, expect } from "vitest";
import { chooseNpcActivity, type NpcActivityInputs } from "./npcActivity.js";

/**
 * The villager ambient-behaviour rule is pure so it can be pinned without a
 * Phaser canvas: given what's around a villager and two rolls, it decides
 * whether they cluster at a fire, work a node, or just stroll.
 */
const base: NpcActivityInputs = {
  night: false,
  hasCampfire: false,
  hasNearbyNode: false,
  campfireRoll: 0,
  workRoll: 0,
};

describe("chooseNpcActivity", () => {
  it("sends villagers to a campfire at night when one exists and the roll passes", () => {
    expect(
      chooseNpcActivity({ ...base, night: true, hasCampfire: true, campfireRoll: 0.5 }),
    ).toBe("campfire");
  });

  it("never clusters at a fire by day, even with one nearby", () => {
    expect(
      chooseNpcActivity({ ...base, night: false, hasCampfire: true, campfireRoll: 0 }),
    ).not.toBe("campfire");
  });

  it("does not cluster at night with no fire to gather around", () => {
    expect(
      chooseNpcActivity({ ...base, night: true, hasCampfire: false, campfireRoll: 0 }),
    ).not.toBe("campfire");
  });

  it("works a nearby node by day when the work roll passes", () => {
    expect(
      chooseNpcActivity({ ...base, hasNearbyNode: true, workRoll: 0.2 }),
    ).toBe("gather");
  });

  it("cannot work a node when none is in reach", () => {
    expect(
      chooseNpcActivity({ ...base, hasNearbyNode: false, workRoll: 0 }),
    ).toBe("wander");
  });

  it("strolls when neither the fire nor the work roll wins", () => {
    expect(
      chooseNpcActivity({ ...base, hasNearbyNode: true, workRoll: 0.9 }),
    ).toBe("wander");
  });

  it("prefers the fire over working a node at night", () => {
    expect(
      chooseNpcActivity({
        ...base,
        night: true,
        hasCampfire: true,
        campfireRoll: 0,
        hasNearbyNode: true,
        workRoll: 0,
      }),
    ).toBe("campfire");
  });
});
