import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import { DIPLOMACY_EVENTS, type DiplomacyId } from "./types.js";

/** Force a diplomacy choice with a specific rival onto the sim, like eventchains' offer(). */
function offer(sim: Simulation, id: DiplomacyId, rivalId: string) {
  sim.state.pendingChoice = {
    id,
    title: "T",
    message: "m",
    options: [
      { label: "a", hint: "" },
      { label: "b", hint: "" },
    ],
    expiresTick: sim.state.tick + 6,
    rivalId,
  };
}

/** A fresh sim plus its first rival with relations reset to a clean baseline. */
function setup(seed: number) {
  const sim = new Simulation({ seed, startingPopulation: 12 });
  const rival = sim.state.rivals[0];
  rival.relations = 0;
  sim.state.resources.food = 30;
  return { sim, rival };
}

describe("diplomacy outcomes", () => {
  describe("a neighbour's gift", () => {
    it("reciprocating (option 0) spends food and warms relations", () => {
      const { sim, rival } = setup(1);
      const pop = sim.living.length;
      offer(sim, "diploGift", rival.id);
      sim.resolveChoice(0);
      expect(sim.state.resources.food).toBe(24); // 30 - 6
      expect(rival.relations).toBeCloseTo(0.2, 10);
      expect(sim.living.length).toBe(pop);
      expect(sim.state.totals.deaths).toBe(0);
      expect(sim.state.pendingChoice).toBeNull();
    });

    it("keeping it (option 1) gains food but cools relations", () => {
      const { sim, rival } = setup(1);
      offer(sim, "diploGift", rival.id);
      sim.resolveChoice(1);
      expect(sim.state.resources.food).toBe(40); // 30 + 10
      expect(rival.relations).toBeCloseTo(-0.2, 10);
      expect(sim.state.totals.deaths).toBe(0);
    });
  });

  describe("tension at the border", () => {
    it("offering tribute (option 0) spends food and warms relations", () => {
      const { sim, rival } = setup(2);
      offer(sim, "diploTension", rival.id);
      sim.resolveChoice(0);
      expect(sim.state.resources.food).toBe(22); // 30 - 8
      expect(rival.relations).toBeCloseTo(0.2, 10);
      expect(sim.state.totals.deaths).toBe(0);
    });

    it("standing firm (option 1) costs no food but cools relations", () => {
      const { sim, rival } = setup(2);
      offer(sim, "diploTension", rival.id);
      sim.resolveChoice(1);
      expect(sim.state.resources.food).toBe(30); // unchanged
      expect(rival.relations).toBeCloseTo(-0.2, 10);
      expect(sim.state.totals.deaths).toBe(0);
    });
  });

  describe("a request for aid", () => {
    it("sending aid (option 0) spends food and warms relations", () => {
      const { sim, rival } = setup(3);
      offer(sim, "diploRequest", rival.id);
      sim.resolveChoice(0);
      expect(sim.state.resources.food).toBe(23); // 30 - 7
      expect(rival.relations).toBeCloseTo(0.2, 10);
      expect(sim.state.totals.deaths).toBe(0);
    });

    it("refusing (option 1) costs no food but cools relations", () => {
      const { sim, rival } = setup(3);
      offer(sim, "diploRequest", rival.id);
      sim.resolveChoice(1);
      expect(sim.state.resources.food).toBe(30); // unchanged
      expect(rival.relations).toBeCloseTo(-0.2, 10);
      expect(sim.state.totals.deaths).toBe(0);
    });
  });

  it("relations stay clamped to [-1, 1] across repeated diplomacy", () => {
    const { sim, rival } = setup(4);
    for (let i = 0; i < 20; i++) {
      offer(sim, "diploTension", rival.id);
      sim.resolveChoice(1); // -0.2 each, far past the floor
    }
    expect(rival.relations).toBe(-1);
  });

  it("spending food never drives stores negative", () => {
    const { sim, rival } = setup(5);
    sim.state.resources.food = 3; // less than any tribute/aid cost
    offer(sim, "diploTension", rival.id);
    sim.resolveChoice(0);
    expect(sim.state.resources.food).toBe(0);
  });

  it("a missing rival id resolves the resource side without crashing", () => {
    const sim = new Simulation({ seed: 6, startingPopulation: 12 });
    sim.state.resources.food = 30;
    sim.state.pendingChoice = {
      id: "diploTension",
      title: "T",
      message: "m",
      options: [
        { label: "a", hint: "" },
        { label: "b", hint: "" },
      ],
      expiresTick: sim.state.tick + 6,
      rivalId: "does-not-exist",
    };
    sim.resolveChoice(0);
    expect(sim.state.resources.food).toBe(22); // 30 - 8, relations side simply skipped
    expect(sim.state.pendingChoice).toBeNull();
  });

  it("surfaces a diplomacy event with a real rival during a normal run", () => {
    const sim = new Simulation({ seed: 42, startingPopulation: 12 });
    let diplomacy: { id: DiplomacyId; rivalId?: string } | null = null;
    for (let i = 0; i < 2000 && sim.living.length > 0 && !diplomacy; i++) {
      sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
      if (sim.state.pendingEncounter) sim.resolveEncounter(true);
      const c = sim.state.pendingChoice;
      if (c && (DIPLOMACY_EVENTS as readonly string[]).includes(c.id)) {
        diplomacy = { id: c.id as DiplomacyId, rivalId: c.rivalId };
      }
      if (sim.state.pendingChoice) sim.resolveChoice(0);
      sim.tick();
    }
    expect(diplomacy).not.toBeNull();
    // The surfaced choice names a real rival the player can actually respond to.
    expect(sim.state.rivals.some((r) => r.id === diplomacy!.rivalId)).toBe(true);
  });
});
