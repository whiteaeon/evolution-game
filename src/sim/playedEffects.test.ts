import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";

/**
 * `playedEffects` is the effects bundle the directly-played world (WorldScene)
 * runs under, exposed so the scene's HUD can show the true carrying capacity and
 * outbreak risk the player's choices produce — not a tech-only estimate. It must
 * fold the same levers economyTick/rollEpidemic do: the belief track, the standing
 * policies, the leader bonus, plus the carrying capacity the player's huts add.
 */
describe("playedEffects — the bundle the HUD reads", () => {
  it("folds the player's hut capacity in exactly (delta == housingBonus)", () => {
    const sim = new Simulation({ seed: 1, startingPopulation: 12 });
    const base = sim.playedEffects(0).capacityBonus;
    expect(sim.playedEffects(40).capacityBonus).toBeCloseTo(base + 40, 6);
    // Negative housing can never *lower* the ceiling (huts only ever add).
    expect(sim.playedEffects(-10).capacityBonus).toBeCloseTo(base, 6);
  });

  it("reflects a standing settlement policy in the carrying capacity it yields", () => {
    // The council (P) lets the player adopt Expansion/Consolidation; the HUD's
    // population ceiling must move with it, since the played economy applies it.
    const capUnder = (stance: string): number => {
      const sim = new Simulation({ seed: 3, startingPopulation: 12 });
      if (stance !== "balanced") sim.setPolicy("settlement", stance);
      return sim.carryingCapacity(sim.playedEffects());
    };
    const balanced = capUnder("balanced");
    expect(capUnder("expansion")).toBeGreaterThan(balanced);
    expect(capUnder("consolidation")).toBeLessThan(balanced);
  });

  it("reflects deepening belief (a reached stage's cohesion bonus)", () => {
    const sim = new Simulation({ seed: 5, startingPopulation: 12 });
    const before = sim.playedEffects().birthMult;
    // Cross the first belief stage's threshold (Ancestor Rites: birthMult 1.04).
    sim.state.culture.accrue(60);
    expect(sim.playedEffects().birthMult).toBeGreaterThan(before);
  });

  it("equals the tech-only bundle under the neutral defaults (no surfacing surprise)", () => {
    // Fresh sim, all-balanced policies, no belief: the only thing playedEffects
    // adds over knowledge effects is the (here zero) housing capacity.
    const sim = new Simulation({ seed: 7, startingPopulation: 12 });
    const tech = sim.state.knowledge.aggregateEffects();
    const played = sim.playedEffects(0);
    expect(played.capacityBonus).toBeCloseTo(tech.capacityBonus, 6);
    expect(played.researchMult).toBeCloseTo(tech.researchMult, 6);
    expect(played.birthMult).toBeCloseTo(tech.birthMult, 6);
  });
});
