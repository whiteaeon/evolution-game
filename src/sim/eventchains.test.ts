import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import type { EventChainId } from "./types.js";

/** Force a pending choice onto the sim (mirrors mechanics.test's forceEncounter). */
function offer(sim: Simulation, id: EventChainId) {
  sim.state.pendingChoice = {
    id,
    title: "T",
    message: "m",
    options: [
      { label: "a", hint: "" },
      { label: "b", hint: "" },
    ],
    expiresTick: sim.state.tick + 6,
  };
}

describe("choice-driven event chains", () => {
  describe("hard winter", () => {
    it("rationing (option 0) spends food and loses no one", () => {
      const sim = new Simulation({ seed: 1, startingPopulation: 10 });
      sim.state.resources.food = 50;
      const pop = sim.living.length;
      offer(sim, "hardWinter");
      sim.resolveChoice(0);
      expect(sim.state.resources.food).toBe(42);
      expect(sim.living.length).toBe(pop);
      expect(sim.state.totals.deaths).toBe(0);
      expect(sim.state.pendingChoice).toBeNull();
    });

    it("a winter hunt (option 1) gains food but can cost lives", () => {
      const sim = new Simulation({ seed: 1, startingPopulation: 24 });
      sim.state.resources.food = 10;
      // A frail, weak tribe: the gamble turns deadly.
      for (const ind of sim.living) ind.genome.strength = 0;
      offer(sim, "hardWinter");
      sim.resolveChoice(1);
      // world.abundance is 1 before the first tick → +18 food.
      expect(sim.state.resources.food).toBe(28);
      expect(sim.state.totals.deaths).toBeGreaterThan(0);
      expect(sim.living.length).toBeLessThan(24);
    });
  });

  describe("sickness in the camp", () => {
    it("tending the sick (option 0) spends food and raises health", () => {
      const sim = new Simulation({ seed: 2, startingPopulation: 12 });
      sim.state.resources.food = 30;
      for (const ind of sim.living) ind.health = 0.2;
      const pop = sim.living.length;
      offer(sim, "sickCamp");
      sim.resolveChoice(0);
      expect(sim.state.resources.food).toBe(24);
      expect(sim.living.every((i) => i.health > 0.2)).toBe(true);
      expect(sim.living.length).toBe(pop);
      expect(sim.state.totals.deaths).toBe(0);
    });

    it("letting it run (option 1) costs no food but can kill the frail", () => {
      const sim = new Simulation({ seed: 2, startingPopulation: 24 });
      sim.state.resources.food = 30;
      for (const ind of sim.living) ind.genome.diseaseResistance = 0;
      offer(sim, "sickCamp");
      sim.resolveChoice(1);
      expect(sim.state.resources.food).toBe(30);
      expect(sim.state.totals.deaths).toBeGreaterThan(0);
    });
  });

  describe("a rival's granary", () => {
    it("trading (option 0) gains some food peacefully", () => {
      const sim = new Simulation({ seed: 3, startingPopulation: 10 });
      sim.state.resources.food = 10;
      const pop = sim.living.length;
      offer(sim, "rivalCache");
      sim.resolveChoice(0);
      expect(sim.state.resources.food).toBe(18); // +8 * abundance(1)
      expect(sim.living.length).toBe(pop);
      expect(sim.state.totals.deaths).toBe(0);
    });

    it("raiding (option 1) seizes more food but spills blood", () => {
      const sim = new Simulation({ seed: 3, startingPopulation: 24 });
      sim.state.resources.food = 10;
      for (const ind of sim.living) ind.genome.strength = 0;
      offer(sim, "rivalCache");
      sim.resolveChoice(1);
      expect(sim.state.resources.food).toBe(34); // +24 * abundance(1)
      expect(sim.state.totals.deaths).toBeGreaterThan(0);
    });
  });

  it("resolving with nothing pending is a no-op", () => {
    const sim = new Simulation({ seed: 1, startingPopulation: 10 });
    const food = sim.state.resources.food;
    sim.resolveChoice(0);
    expect(sim.state.resources.food).toBe(food);
    expect(sim.state.pendingChoice).toBeNull();
  });

  it("an ignored choice expires on a later tick", () => {
    const sim = new Simulation({ seed: 1, startingPopulation: 10 });
    offer(sim, "hardWinter");
    sim.state.pendingChoice!.expiresTick = sim.state.tick; // already due
    sim.tick();
    expect(sim.state.pendingChoice).toBeNull();
  });

  it("the trigger surfaces a choice during a normal cold-climate run", () => {
    const sim = new Simulation({ seed: 42, startingPopulation: 12, baseCold: 0.45 });
    let offered = false;
    for (let i = 0; i < 600 && sim.living.length > 0 && !offered; i++) {
      sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
      if (sim.state.pendingEncounter) sim.resolveEncounter(true);
      sim.tick();
      if (sim.state.pendingChoice) offered = true;
    }
    expect(offered).toBe(true);
  });
});
