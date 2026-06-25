import type { SimConfig } from "./types.js";

/** Selectable start scenarios, chosen on the new-run flow. */
export const SCENARIOS = ["valley", "frozen", "island", "crowded"] as const;
export type Scenario = (typeof SCENARIOS)[number];

/**
 * The config knobs a scenario sets — the *where, how many, and how harsh the
 * world is* at the start. These flow straight into {@link SimConfig}. Scenarios
 * stay orthogonal to difficulty presets: a scenario fixes the starting
 * region/biome, population, stores, ambient cold and carrying capacity, while
 * the difficulty preset still scales event lethality and world abundance on top.
 */
type ScenarioConfig = Pick<
  SimConfig,
  "startRegion" | "startingPopulation" | "startingFood" | "baseCold" | "carryingCapacityBase"
>;

export interface ScenarioPreset {
  id: Scenario;
  label: string;
  blurb: string;
  /**
   * True if a tribe on standard difficulty is meant to reach the Information Age
   * under plain autopilot. The challenge scenarios (false) are survivable — a win
   * is possible — but lean enough that many seeds end in extinction.
   */
  standard: boolean;
  config: ScenarioConfig;
}

/**
 * One small data table. Each scenario only sets the start knobs that define it;
 * everything else falls back to {@link DEFAULT_CONFIG}. The sim stays pure — it
 * just reads the config it is handed.
 */
export const SCENARIO_PRESETS: Record<Scenario, ScenarioPreset> = {
  valley: {
    id: "valley",
    label: "Lush Valley",
    blurb: "A fertile river homeland — plentiful food, mild winters, room to grow.",
    standard: true,
    config: {
      startRegion: "twin-rivers",
      startingPopulation: 12,
      startingFood: 30,
      baseCold: 0.2,
      carryingCapacityBase: 18,
    },
  },
  frozen: {
    id: "frozen",
    label: "Frozen World",
    blurb: "A tundra in the grip of an ice age. Lean, bitter, and only the cold-hardy endure.",
    standard: false,
    config: {
      startRegion: "frostvale",
      startingPopulation: 9,
      startingFood: 14,
      baseCold: 0.5,
      carryingCapacityBase: 14,
    },
  },
  island: {
    id: "island",
    label: "Lonely Island",
    blurb: "A handful of founders on a remote shore. Few hands, but the tides are generous.",
    standard: false,
    config: {
      startRegion: "pearl-coast",
      startingPopulation: 6,
      startingFood: 22,
      baseCold: 0.16,
      carryingCapacityBase: 12,
    },
  },
  crowded: {
    id: "crowded",
    label: "Crowded Lands",
    blurb: "A teeming savanna band — many mouths to feed, but fertile ground to farm.",
    standard: true,
    config: {
      startRegion: "wide-savanna",
      startingPopulation: 18,
      startingFood: 24,
      baseCold: 0.22,
      carryingCapacityBase: 16,
    },
  },
};
