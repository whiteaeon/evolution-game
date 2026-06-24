import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import { DIFFICULTIES, DIFFICULTY_PRESETS, type Difficulty } from "./difficulty.js";

/** Autopilot identical to the headless driver, parameterised by config. */
function autoplay(difficulty: Difficulty, seed: number, budget = 4000): Simulation {
  const sim = new Simulation({ seed, ...DIFFICULTY_PRESETS[difficulty].config });
  for (let i = 0; i < budget && sim.living.length > 0 && !sim.state.won; i++) {
    sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
    if (sim.state.pendingEncounter) sim.resolveEncounter(true);
    if (sim.state.pendingChoice) sim.resolveChoice(0);
    sim.tick();
  }
  return sim;
}

describe("difficulty presets", () => {
  it("exposes exactly the three presets, keyed by id", () => {
    expect(DIFFICULTIES).toEqual(["gentle", "standard", "harsh"]);
    for (const d of DIFFICULTIES) expect(DIFFICULTY_PRESETS[d].id).toBe(d);
  });

  it("each preset is a valid, constructible config", () => {
    for (const d of DIFFICULTIES) {
      const c = DIFFICULTY_PRESETS[d].config;
      expect(c.startingPopulation).toBeGreaterThan(0);
      expect(c.startingFood).toBeGreaterThan(0);
      expect(c.eventLethality).toBeGreaterThan(0);
      // Constructs and produces the requested starting state, sized to the preset.
      const sim = new Simulation({ seed: 1, ...c });
      expect(sim.living.length).toBe(c.startingPopulation);
      expect(sim.state.resources.food).toBe(c.startingFood);
    }
  });

  it("standard scales nothing — it reproduces the historical balance", () => {
    const c = DIFFICULTY_PRESETS.standard.config;
    expect(c.eventLethality).toBe(1);
    expect(c.abundanceBonus).toBe(0);
  });

  it("standard autopilot still reaches the Information Age in a sane span", () => {
    const sim = autoplay("standard", 42);
    expect(sim.state.won).toBe(true);
    expect(sim.state.era).toBe("Information");
    expect(sim.state.tick).toBeGreaterThanOrEqual(150);
    expect(sim.state.tick).toBeLessThanOrEqual(2000);
  });

  it("gentle is no harder than standard — it also completes", () => {
    const sim = autoplay("gentle", 42);
    expect(sim.state.won).toBe(true);
  });

  it("harsh is hard but completable — the autopilot wins for at least one seed", () => {
    // Harsh is meant to be lethal: many runs end in extinction. What the preset
    // must guarantee is that a win is *possible*, not that every seed survives.
    const won = Array.from({ length: 12 }, (_, i) => autoplay("harsh", i + 1)).some(
      (sim) => sim.state.won,
    );
    expect(won).toBe(true);
  });
});
