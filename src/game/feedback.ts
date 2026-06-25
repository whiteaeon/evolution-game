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

/** Baseline dots a building's landing dust kicks up — dustBurst's default. */
export const DUST_BURST_BASE = 10;

/**
 * How big a dust cloud a building's landing kicks up. A pricier, heavier
 * structure lands harder, so the puff swells a dot per few resources of its
 * cost — a hut thuds down with a fatter kick than a cheap campfire — exactly as
 * the gather and quest bursts swell with their magnitude. Clamped to stay
 * tasteful and cheap (the scene's live-particle cap trims it further).
 */
export function dustBurstCount(cost: number): number {
  const bonus = Math.max(0, Math.floor(cost / 5));
  return Math.min(16, DUST_BURST_BASE + bonus);
}

/** Duration (ms) of a build's landing-thud camera kick — brief so the placement
 *  punches without lingering. */
export const BUILD_THUD_MS = 130;

/** Baseline camera-shake intensity a building's landing thud kicks up. */
export const BUILD_THUD_BASE = 0.0022;

/**
 * How hard the camera kicks when a building thuds into place. A heavier, pricier
 * structure lands harder, so the jolt swells a touch per few resources of its
 * cost — a hut thuds down with a firmer kick than a cheap campfire — exactly as
 * its dust cloud ({@link dustBurstCount}) and spend float swell with the cost.
 * Clamped well below the raid resolution's jolt (0.006) so a friendly placement
 * never out-shakes an actual attack on the camp.
 */
export function buildThudShake(cost: number): number {
  const bonus = Math.max(0, Math.floor(cost / 5)) * 0.0005;
  return Math.min(0.005, BUILD_THUD_BASE + bonus);
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

/** Baseline max-scale the quest turn-in's celebratory ring blooms to. */
export const QUEST_RING_SCALE_BASE = 5;

/**
 * How far the quest turn-in's celebratory ring expands. Completing a quest is the
 * game's climactic payoff, so — like the belief-milestone ring — a bright ring
 * blooms at the giver, swelling a little with the size of the payout so a fat
 * reward blooms wider. Clamped so even a huge bounty never fills the screen.
 */
export function questRingScale(rewardAmount: number): number {
  const bonus = Math.max(0, Math.floor(rewardAmount / 6));
  return Math.min(9, QUEST_RING_SCALE_BASE + bonus);
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
 * How many particles one *rally* muster pops at the villager falling in to
 * defend. Each press musters a single villager, but the pop swells as the band
 * grows — every defender already standing adds a particle — so a hard-pressed
 * rally builds visible momentum at the hearth, directly rewarding mustering the
 * whole band before the raiders arrive. It stays subdued (smaller and lower-
 * capped than the raid resolution) since it fires once per villager, often in
 * quick succession during the defend window.
 *
 * @param rallied total villagers now defending (including the one just mustered,
 *                so the first rally pops the baseline and each adds one).
 */
export function rallyBurstCount(rallied: number): number {
  return Math.min(10, 5 + Math.max(0, Math.floor(rallied) - 1));
}

/**
 * The note that floats off the Study button when a research session is funded at
 * the totem: the food spent and the insight gained. Research is the one resource
 * transaction that happens behind a full-screen panel, so its payoff earns a
 * screen-space floating confirmation (mirroring the world floatGain every other
 * action pops) rather than a particle burst the panel would hide. Uses the same
 * −/→ glyphs as the Study button label so the spend reads consistently.
 */
export function studyFloatText(food: number, points: number): string {
  return `−${food} food → +${points} insight`;
}

/**
 * The note that floats off a freshly-placed building: the resource cost just
 * debited. Every other action confirms its resource change with a floatGain
 * ("+N wood" on a gather, the reward on a quest, the {@link studyFloatText}
 * spend at the totem) — placing a building only ticked the HUD number down.
 * This closes that loop at the placement site, using the same "−" debit glyph
 * as {@link studyFloatText} so a spend reads consistently across the game.
 */
export function buildSpendText(amount: number, res: string): string {
  return `−${amount} ${res}`;
}

/**
 * The note that floats at the camp when a raid breaks through and plunders food,
 * or null when nothing was taken (a clean defence). Every other resource change
 * pops an in-world floatGain at its site — a gather's "+N wood", a build's
 * {@link buildSpendText} debit, a quest's reward — but a raid breach only ever
 * flashed its loss in the banner. This closes that loop at the hearth, reusing
 * the same "−" debit glyph so a food loss reads consistently with a build spend.
 * A won or bloodless raid takes nothing, so it earns no float (returns null).
 */
export function raidPlunderText(plunder: number): string | null {
  if (plunder <= 0) return null;
  return buildSpendText(plunder, "food");
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
