import { clamp01 } from "./genome.js";
import { BIOME_PROFILE, type BiomeProfile } from "./regions.js";
import { BALANCE } from "./balance.js";
import type { SimConfig, TechEffects } from "./types.js";
import type { SimState } from "./simulation.js";

export function updateWorld(state: SimState, config: SimConfig, e: Required<TechEffects>): void {
  const w = state.world;
  const b = BIOME_PROFILE[state.biome];
  w.seasonIndex = state.tick % 4;
  w.season = w.seasonIndex / 4;
  const { cold, abundance } = seasonalConditions(config, b, w.season, e);
  w.cold = cold;
  w.abundance = abundance;
}

/**
 * Seasonal cold + food multiplier for a biome at a given seasonal phase. The
 * phase term is +1 at winter (season 0) and -1 at summer (season 0.5): cold
 * rises with it, abundance falls against it, so winter is the joint coldest +
 * leanest point and summer the warmest + richest. Swing magnitudes are BALANCE
 * tunables and symmetric about the yearly mean, so deepening them never shifts
 * the average — only the gap between scarcity and growth windows.
 */
export function seasonalConditions(
  config: SimConfig,
  b: BiomeProfile,
  season: number,
  e: Required<TechEffects>,
): { cold: number; abundance: number } {
  const phase = Math.cos(season * Math.PI * 2);
  const cold = clamp01(config.baseCold + b.coldAdd + phase * BALANCE.seasonColdSwing);
  const abundance =
    (0.9 - phase * BALANCE.seasonAbundanceSwing + e.abundance + (config.abundanceBonus ?? 0)) *
    b.abundance;
  return { cold, abundance };
}
