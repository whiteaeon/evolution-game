import type { SimConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./simulation.js";

/** Toggleable run modifiers, chosen on the new-run flow for replay variety. */
export const MUTATORS = [
  "iceAge",
  "harshDisease",
  "abundantGame",
  "fastEras",
  "hostileNeighbours",
] as const;
export type MutatorId = (typeof MUTATORS)[number];

export interface MutatorPreset {
  id: MutatorId;
  label: string;
  blurb: string;
  /**
   * Nudge an already-built config in place. Mutators are *toggles that stack*, so
   * each one only adjusts existing knobs additively/multiplicatively and never
   * overwrites — letting any combination compose cleanly on top of the chosen
   * difficulty + scenario. The sim stays pure: it just reads the config it gets.
   */
  apply(c: Partial<SimConfig>): void;
}

/**
 * One small data table, mirroring {@link DIFFICULTY_PRESETS}/{@link SCENARIO_PRESETS}.
 * Every mutator maps to existing {@link SimConfig} knobs (cold, abundance, disease
 * lethality, research speed, rival hostility); the sim reads those knobs at its
 * normal balance sites, so no new simulation branch is needed.
 */
export const MUTATOR_PRESETS: Record<MutatorId, MutatorPreset> = {
  iceAge: {
    id: "iceAge",
    label: "Ice Age",
    blurb: "A deeper chill grips the world — winters bite harder and longer.",
    apply: (c) => {
      c.baseCold = Math.min(1, (c.baseCold ?? DEFAULT_CONFIG.baseCold) + 0.18);
    },
  },
  harshDisease: {
    id: "harshDisease",
    label: "Harsh Disease",
    blurb: "Sickness runs rife; outbreaks cut deeper and only the resistant endure.",
    apply: (c) => {
      c.diseaseLethality = (c.diseaseLethality ?? 1) * 1.5;
    },
  },
  abundantGame: {
    id: "abundantGame",
    label: "Abundant Game",
    blurb: "Teeming herds and lush forage — food is plentiful.",
    apply: (c) => {
      c.abundanceBonus = (c.abundanceBonus ?? 0) + 0.25;
    },
  },
  fastEras: {
    id: "fastEras",
    label: "Fast Eras",
    blurb: "Ideas spread quickly; research speeds up and the ages turn faster.",
    apply: (c) => {
      c.researchMult = (c.researchMult ?? 1) * 1.6;
    },
  },
  hostileNeighbours: {
    id: "hostileNeighbours",
    label: "Hostile Neighbours",
    blurb: "The neighbouring tribes eye your camp with open hostility from the start.",
    apply: (c) => {
      c.rivalHostility = (c.rivalHostility ?? 0) + 0.6;
    },
  },
};

/**
 * Fold the selected mutators into a fresh copy of `base`, in list order. Returns a
 * new config; the input is left untouched. With no mutators selected this is an
 * exact copy of `base`, so a plain run is unaffected.
 */
export function applyMutators(
  base: Partial<SimConfig>,
  ids: readonly MutatorId[],
): Partial<SimConfig> {
  const c = { ...base };
  for (const id of ids) MUTATOR_PRESETS[id].apply(c);
  return c;
}
