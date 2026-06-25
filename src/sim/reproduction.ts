import { clamp01, inherit } from "./genome.js";
import { BALANCE, SHELTER_DEF } from "./balance.js";
import type { BiomeProfile } from "./regions.js";
import type { Policies } from "./policies.js";
import type { RNG } from "./rng.js";
import type { SimEngine } from "./engine.js";
import type { Individual, Shelter, SimConfig, TechEffects } from "./types.js";

export function reproduce(eng: SimEngine, e: Required<TechEffects>): void {
  const s = eng.state;
  const adults = eng.living.filter(
    (i) => i.age >= eng.config.reproMinAge && i.age <= eng.config.reproMaxAge && i.health > 0.3,
  );
  const females = adults.filter((i) => i.sex === "f");
  const males = adults.filter((i) => i.sex === "m");
  if (females.length === 0 || males.length === 0) return;

  const capacity = carryingCapacity(eng.config, e, s.shelter, eng.biome());
  let pop = eng.living.length;
  const foodSecurity = clamp01(s.resources.food / (pop * 2 + 1));

  // Fitness is constant across the loop (nothing it reads is mutated here), so
  // compute each pool's weights once instead of re-scanning per birth — the
  // old per-call map made selection O(females²) at large populations.
  const b = eng.biome();
  const cold = s.world.cold;
  const { weights: femaleWeights, total: femaleTotal } = fitnessWeights(s.policies, females, e, b, cold, s.cookingActive);
  const { weights: maleWeights, total: maleTotal } = fitnessWeights(s.policies, males, e, b, cold, s.cookingActive);

  for (let n = 0; n < females.length; n++) {
    if (pop >= capacity) break;
    if (s.resources.food < BALANCE.birthFoodCost) break;
    const mother = pickByWeights(females, femaleWeights, femaleTotal, eng.rng);
    const pBirth = 0.85 * e.birthMult * mother.health * (0.45 + 0.55 * foodSecurity);
    if (!eng.rng.chance(pBirth)) continue;

    const father = pickByWeights(males, maleWeights, maleTotal, eng.rng);
    const childGenome = inherit(mother.genome, father.genome, eng.rng, eng.config.mutationRate);
    const child = eng.makeIndividual(
      childGenome,
      Math.max(mother.generation, father.generation) + 1,
      0,
      mother.id,
      father.id,
    );
    if (mother.lineage || father.lineage) child.lineage = mother.lineage ?? father.lineage;
    s.individuals.push(child);
    eng.invalidateLiving();
    s.resources.food -= BALANCE.birthFoodCost;
    s.totals.births++;
    pop++;
  }
}

export function carryingCapacity(
  config: SimConfig,
  e: Required<TechEffects>,
  shelter: Shelter,
  b: BiomeProfile,
): number {
  return (
    config.carryingCapacityBase +
    SHELTER_DEF[shelter].capacity +
    b.capacity +
    e.capacityBonus
  );
}

export function fitnessWeights(
  policies: Policies,
  pool: Individual[],
  e: Required<TechEffects>,
  b: BiomeProfile,
  cold: number,
  cookingActive: boolean,
): { weights: number[]; total: number } {
  // Standing social policy can sharpen (>1) or flatten (<1) individual selection
  // by raising each fitness weight to a pressure exponent. The balanced default is
  // 1, leaving the weights — and the run — exactly as before.
  const pressure = policies.selectionPressure();
  const weights = pool.map((m) => {
    const f = fitness(m, e, b, cold, cookingActive);
    return pressure === 1 ? f : Math.pow(f, pressure);
  });
  let total = 0;
  for (const w of weights) total += w;
  return { weights, total };
}

export function pickByWeights(pool: Individual[], weights: number[], total: number, rng: RNG): Individual {
  let r = rng.next() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function fitness(
  ind: Individual,
  e: Required<TechEffects>,
  b: BiomeProfile,
  cold: number,
  cookingActive: boolean,
): number {
  let f = 0.2 + ind.health;
  f += ind.genome.coldTolerance * cold;
  f += ind.genome.strength * 0.3 + ind.genome.dexterity * 0.2;
  // The biome rewards a particular trait — location shapes the lineage.
  f += ind.genome[b.selectTrait] * b.selectWeight;
  // Cooked food + schooling reward bigger brains.
  const intelPressure = (cookingActive || ind.ateCooked ? BALANCE.cookingIntelWeight : 0) + e.intelPressure;
  if (intelPressure > 0) f += ind.genome.intelligence * intelPressure;
  return Math.max(0.01, f);
}
