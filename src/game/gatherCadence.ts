/**
 * Pure cooldown pacing for hold-to-gather.
 *
 * The player can hold the gather key to harvest a node repeatedly; this advances
 * the per-frame cooldown and reports when a swing should land, so each held
 * second yields a steady cadence rather than one keypress per swing. Kept
 * Phaser-free so the cadence is unit-testable.
 */

export interface GatherStep {
  /** True on the frames a harvest should land. */
  harvest: boolean;
  /** Cooldown remaining (ms) after this frame. */
  cooldown: number;
}

/**
 * Advance the gather cooldown by `dt` ms and decide whether a swing lands.
 *
 * A swing lands only while the key is `held` and the cooldown has run out; on
 * that frame the cooldown resets to `reset`, gating the next swing. Otherwise
 * the cooldown counts down toward zero (never below it).
 */
export function stepGather(cooldown: number, dt: number, held: boolean, reset: number): GatherStep {
  const remaining = Math.max(0, cooldown - dt);
  if (held && remaining <= 0) return { harvest: true, cooldown: reset };
  return { harvest: false, cooldown: remaining };
}
