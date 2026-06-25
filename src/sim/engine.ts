import type { RNG } from "./rng.js";
import type { BiomeProfile } from "./regions.js";
import type { DialogueSituation } from "./dialogue.js";
import type { SimState, TraitAverages } from "./simulation.js";
import type {
  Genome,
  Individual,
  ResourceCost,
  SimConfig,
  SimEventType,
  Task,
} from "./types.js";

/**
 * Internal surface the {@link Simulation} class exposes to the extracted concern
 * modules (production, reproduction, events, raids, …). It is the same `this`,
 * narrowed to the members those modules touch — keeping the class's own `private`
 * modifiers and public API unchanged while letting the logic live in focused
 * files. Not part of the public sim barrel (index.ts does not re-export it).
 */
export interface SimEngine {
  readonly config: SimConfig;
  state: SimState;
  workers: Record<Task, Individual[]>;
  rng: RNG;
  rivalRng: RNG;
  readonly living: Individual[];
  biome(): BiomeProfile;
  makeIndividual(
    genome: Genome,
    generation: number,
    age: number,
    motherId?: number,
    fatherId?: number,
    rng?: RNG,
  ): Individual;
  invalidateLiving(): void;
  logEvent(type: SimEventType, message: string): void;
  emitDialogue(situation: DialogueSituation): void;
  hasResources(req: ResourceCost): boolean;
  spendResources(req: ResourceCost): void;
  traitAverages(): TraitAverages;
}
