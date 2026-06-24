import { RNG } from "./rng.js";
import { TRAITS, type Genome } from "./types.js";

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function makeGenome(fill: (trait: string) => number): Genome {
  const g = {} as Genome;
  for (const t of TRAITS) g[t] = clamp01(fill(t));
  return g;
}

/** A founder genome: each trait drawn around `mean` with spread `sd`. */
export function randomGenome(rng: RNG, mean = 0.4, sd = 0.12): Genome {
  return makeGenome(() => rng.gauss(mean, sd));
}

/**
 * Mendelian inheritance: each gene is copied from one randomly chosen parent,
 * then perturbed by a small Gaussian mutation. With mutationRate == 0 every
 * offspring gene is *exactly* one parent's allele (proves inheritance); with
 * mutationRate > 0 the value drifts (proves mutation). Crossover-per-gene keeps
 * population variance high so selection can move the mean.
 */
export function inherit(a: Genome, b: Genome, rng: RNG, mutationRate: number): Genome {
  return makeGenome((t) => {
    const parent = rng.chance(0.5) ? a : b;
    const base = parent[t as keyof Genome];
    return base + (mutationRate > 0 ? rng.gauss(0, mutationRate) : 0);
  });
}

export function averageGenome(genomes: Genome[]): Genome {
  if (genomes.length === 0) return makeGenome(() => 0);
  return makeGenome((t) => {
    let sum = 0;
    for (const g of genomes) sum += g[t as keyof Genome];
    return sum / genomes.length;
  });
}
