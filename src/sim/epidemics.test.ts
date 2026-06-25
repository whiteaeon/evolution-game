import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import type { Era } from "./types.js";

/**
 * Epidemics layer occasional, severe outbreaks on top of endemic disease. Their
 * severity is a pure, bounded function of crowding, biome, era and medical tech,
 * and survival is weighted hard toward diseaseResistance. These tests pin down
 * that scaling + mitigation deterministically (no RNG in epidemicSeverity).
 */

/** Effects bundle reflecting the techs currently in `discovered`. */
const effects = (sim: Simulation) => sim.state.knowledge.aggregateEffects();

describe("epidemic severity scaling", () => {
  it("rises with population density (crowding toward carrying capacity)", () => {
    const sparse = new Simulation({ seed: 1, startingPopulation: 8, carryingCapacityBase: 60 });
    const crowded = new Simulation({ seed: 1, startingPopulation: 40, carryingCapacityBase: 60 });
    expect(crowded.epidemicSeverity(effects(crowded))).toBeGreaterThan(
      sparse.epidemicSeverity(effects(sparse)),
    );
  });

  it("rises with era (denser, more-connected settlements spread disease faster)", () => {
    const sim = new Simulation({ seed: 2, startingPopulation: 20, carryingCapacityBase: 30 });
    const eras: Era[] = ["Paleolithic", "Bronze Age", "Medieval", "Information"];
    const sev = eras.map((era) => {
      sim.state.era = era;
      return sim.epidemicSeverity(effects(sim));
    });
    // Strictly increasing across eras, all else equal.
    for (let i = 1; i < sev.length; i++) expect(sev[i]).toBeGreaterThan(sev[i - 1]);
  });

  it("scales with the biome's diseaseMult (feverish river valley vs dry desert)", () => {
    const river = new Simulation({ seed: 3, startingPopulation: 20, carryingCapacityBase: 30, startRegion: "twin-rivers" });
    const desert = new Simulation({ seed: 3, startingPopulation: 20, carryingCapacityBase: 30, startRegion: "sunscar" });
    expect(river.epidemicSeverity(effects(river))).toBeGreaterThan(
      desert.epidemicSeverity(effects(desert)),
    );
  });

  it("is bounded in [0, epidemicMaxSeverity] even at maximal crowding/era/biome", () => {
    const sim = new Simulation({ seed: 4, startingPopulation: 60, carryingCapacityBase: 16, startRegion: "twin-rivers" });
    sim.state.era = "Information";
    const sev = sim.epidemicSeverity(effects(sim));
    expect(sev).toBeGreaterThan(0);
    expect(sev).toBeLessThanOrEqual(0.7); // BALANCE.epidemicMaxSeverity
  });
});

describe("epidemic mitigation by medical tech", () => {
  it("medicine → sanitation → vaccines each strictly reduce severity, toward near-zero", () => {
    const sim = new Simulation({ seed: 5, startingPopulation: 30, carryingCapacityBase: 30, startRegion: "twin-rivers" });
    sim.state.era = "Information"; // so every tier is era-appropriate

    const k = sim.state.knowledge.discovered;
    const none = sim.epidemicSeverity(effects(sim));
    k.add("medicine");
    const medicine = sim.epidemicSeverity(effects(sim));
    k.add("sanitation");
    const sanitation = sim.epidemicSeverity(effects(sim));
    k.add("vaccines");
    const vaccines = sim.epidemicSeverity(effects(sim));

    expect(medicine).toBeLessThan(none);
    expect(sanitation).toBeLessThan(medicine);
    expect(vaccines).toBeLessThan(sanitation);
    // Full medical stack all but eliminates the outbreak.
    expect(vaccines).toBeLessThan(none * 0.1);
  });
});

describe("epidemic mortality selects hard on diseaseResistance", () => {
  it("kills some but never all, and culls the least resistant first", () => {
    // Pool the dead vs survivors across several seeds so the selection signal
    // stands out from single-outbreak RNG noise (cf. selection.test.ts).
    const killed: number[] = [];
    const survivors: number[] = [];
    let totalDeaths = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const sim = new Simulation({ seed, startingPopulation: 50, carryingCapacityBase: 50, startRegion: "twin-rivers" });
      sim.state.era = "Iron Age"; // severe, pre-medicine outbreak

      const before = sim.living.length;
      const deaths = sim.triggerEpidemic();
      totalDeaths += deaths;

      expect(sim.living.length).toBeGreaterThan(0); // never a wipe (bounded)
      for (const ind of sim.state.individuals) {
        (ind.alive ? survivors : killed).push(ind.genome.diseaseResistance);
      }
      expect(before - sim.living.length).toBe(deaths);
    }
    expect(totalDeaths).toBeGreaterThan(0); // outbreaks bite

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // The dead skew less resistant than the survivors: the outbreak selects.
    expect(mean(killed)).toBeLessThan(mean(survivors));
  });

  it("a tribe with full medical tech shrugs the same outbreak off", () => {
    const sim = new Simulation({ seed: 7, startingPopulation: 50, carryingCapacityBase: 50, startRegion: "twin-rivers" });
    sim.state.era = "Information";
    for (const t of ["medicine", "sanitation", "vaccines"] as const) sim.state.knowledge.discovered.add(t);

    const before = sim.living.length;
    sim.triggerEpidemic();
    // Vaccines drive severity near zero: deaths are a tiny fraction at most.
    expect(sim.living.length).toBeGreaterThanOrEqual(before - 2);
  });
});
