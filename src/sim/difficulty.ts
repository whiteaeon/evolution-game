import type { SimConfig } from "./types.js";

/** Selectable difficulty presets, chosen on the new-run flow. */
export const DIFFICULTIES = ["gentle", "standard", "harsh"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** The config knobs a preset scales. These flow straight into {@link SimConfig}. */
type DifficultyConfig = Pick<
  SimConfig,
  "startingPopulation" | "startingFood" | "eventLethality" | "abundanceBonus"
>;

export interface DifficultyPreset {
  id: Difficulty;
  label: string;
  blurb: string;
  config: DifficultyConfig;
}

/**
 * One small data table. `standard` reproduces the historical balance exactly;
 * `gentle`/`harsh` only scale a few existing knobs (starting pop/food, event
 * lethality, world abundance). The sim stays pure — it just reads the config.
 */
export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultyPreset> = {
  gentle: {
    id: "gentle",
    label: "Gentle",
    blurb: "More founders and food, kinder events.",
    config: { startingPopulation: 14, startingFood: 35, eventLethality: 0.7, abundanceBonus: 0.15 },
  },
  standard: {
    id: "standard",
    label: "Standard",
    blurb: "The intended challenge.",
    config: { startingPopulation: 10, startingFood: 20, eventLethality: 1, abundanceBonus: 0 },
  },
  harsh: {
    id: "harsh",
    label: "Harsh",
    blurb: "Fewer founders, lean stores, deadlier events.",
    config: { startingPopulation: 8, startingFood: 12, eventLethality: 1.3, abundanceBonus: -0.1 },
  },
};
