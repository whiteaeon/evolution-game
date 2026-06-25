/**
 * Pure mapping from key sim events to the small particle-burst they trigger in
 * the scene. Kept Phaser-free so the event→feedback routing can be unit-tested
 * without a canvas: this module only decides *what* should fire and *how it
 * should look*; the scene owns the actual emission and the hard particle cap.
 */
import type { SimEventType } from "../sim/index.js";

/** The five celebrated moments that earn a visible burst. */
export type FeedbackKind = "birth" | "death" | "discovery" | "raid" | "quest";

export interface BurstStyle {
  /** Particle colour, 0xRRGGBB. */
  color: number;
  /** Particles emitted per burst — small; the scene caps the live total too. */
  count: number;
  /** Baseline vertical drift per step (negative rises, positive sinks). */
  rise: number;
}

/** Taste-tuned look per moment: warm births, grey sinking deaths, etc. */
export const BURST_STYLE: Record<FeedbackKind, BurstStyle> = {
  birth: { color: 0xfff2a8, count: 8, rise: -0.5 },
  death: { color: 0x9aa0aa, count: 6, rise: 0.35 },
  discovery: { color: 0xffe08a, count: 10, rise: -0.45 },
  raid: { color: 0xff5a4a, count: 12, rise: -0.2 },
  quest: { color: 0x9fe0ff, count: 10, rise: -0.5 },
};

/** Baseline dots a single gather swing pops — the scene's default burst size. */
export const GATHER_BURST_BASE = 7;

/**
 * How many particles one gather swing pops. Better tools (a higher researched
 * gatherMult) harvest more per swing, so the burst swells one dot per extra unit
 * taken — a fat-yield strike pops fatter, visibly rewarding the tech investment,
 * exactly as quest and raid bursts swell with their payoff. A bare-handed single
 * unit keeps the baseline; clamped to stay tasteful and cheap.
 */
export function gatherBurstCount(amount: number): number {
  const bonus = Math.max(0, Math.floor(amount) - 1);
  return Math.min(12, GATHER_BURST_BASE + bonus);
}

/**
 * How many celebration particles a completed quest turn-in earns: the baseline
 * quest burst, swelled a little by the size of the payout so a fat reward pops
 * fatter — clamped to stay tasteful and cheap (never more than the scene's cap).
 */
export function questCelebrationCount(rewardAmount: number): number {
  const bonus = Math.max(0, Math.floor(rewardAmount / 4));
  return Math.min(14, BURST_STYLE.quest.count + bonus);
}

/**
 * How many particles a *quest accept* earns: a subdued sibling of the turn-in
 * burst. Accepting a task is a promise, not a payoff, so it pops smaller and is
 * capped lower than {@link questCelebrationCount} — for any given reward the
 * completion always out-celebrates the acceptance. It still swells a touch with
 * the reward so a fat bounty feels worth taking on.
 */
export function acceptCelebrationCount(rewardAmount: number): number {
  const bonus = Math.max(0, Math.floor(rewardAmount / 8));
  return Math.min(8, 4 + bonus);
}

/**
 * How many particles a resolved raid throws at the hearth. A victory swells with
 * the size of the band that held the line — every villager the player rallied
 * adds a particle — so a hard-won defence pops bigger, directly rewarding the
 * rally effort. A breach is a small, subdued puff: the camp is reeling. Both
 * stay within the scene's tasteful cap so a long defence never floods the scene.
 *
 * @param defenders total defenders (the chieftain plus rallied villagers, so
 *                  the bonus is one particle per villager mustered).
 */
export function raidCelebrationCount(won: boolean, defenders: number): number {
  if (!won) return 5;
  return Math.min(14, 8 + Math.max(0, defenders - 1));
}

/**
 * Route a logged sim event to the burst it deserves, or null when it earns no
 * extra juice. Births and deaths are not log events — the scene derives those
 * from the `totals` counters — so they are not handled here.
 */
export function burstForEvent(type: SimEventType, message: string): FeedbackKind | null {
  switch (type) {
    case "discovery":
      return "discovery";
    case "raid":
      return "raid";
    case "milestone":
      return message.startsWith("Quest complete") ? "quest" : "discovery";
    default:
      return null;
  }
}
