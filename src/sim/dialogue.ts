/**
 * Flavor dialogue — short, data-driven lines that give the tribe a voice.
 *
 * A pure content table keyed by {@link DialogueSituation}, plus a deterministic
 * picker. Like {@link CodexEntry} lore, this is read-only data: it holds no state
 * and never touches the RNG, the renderer or the DOM. The simulation emits one of
 * these lines into its event log when a notable moment occurs (an encounter, an
 * event chain, an era change, a notable birth or death), seeded by the sim tick so
 * the same run always speaks the same words.
 */

/** The situations the tribe can react to with a flavor line. */
export type DialogueSituation =
  | "encounter"
  | "eventChain"
  | "eraChange"
  | "birth"
  | "death";

/** The content table: a handful of short voice lines per situation. */
export const DIALOGUE: Record<DialogueSituation, readonly string[]> = {
  encounter: [
    "Strangers on the ridge — do we meet them, or melt into the trees?",
    "Their faces are not ours, yet their eyes are tired like ours.",
    "New blood, new ways. The elders watch in silence.",
    "We have walked far to find that we are not alone.",
    "Friend or foe, they too are children of the long winter.",
  ],
  eventChain: [
    "The choice is heavy, and the whole camp is listening.",
    "Whatever we decide, our children will tell the tale of it.",
    "There is no path without a cost. We must choose which to pay.",
    "The fire crackles while we weigh our fate.",
    "Speak now, before the moment passes us by.",
  ],
  eraChange: [
    "The world is not as it was when our grandmothers were young.",
    "We have crossed into a time the old songs never foretold.",
    "Look how far we have come — and how far there is yet to go.",
    "A new age dawns, and our hands are ready for it.",
    "The elders would not believe the things we know now.",
  ],
  birth: [
    "A new cry by the fire — the line endures.",
    "Another is born who will never know the old hardships.",
    "The little one is strong. The tribe will go on.",
    "May this child see further than any of us.",
    "New hands for the work, new voices for the songs.",
  ],
  death: [
    "We sing them into the dark, as they sung for those before.",
    "Too many empty places by the fire tonight.",
    "We will carry their names with us, wherever we go.",
    "The hardest winters take the dearest of us.",
    "Grieve, then rise — the living still need tending.",
  ],
};

/**
 * Deterministically pick one line for a situation from an integer seed. Pure: it
 * mixes the seed with the situation (so several situations sharing a tick still
 * differ) via a small FNV-style hash, and never draws from the sim RNG — so
 * surfacing flavor can never perturb the simulation's random stream.
 */
export function pickDialogueLine(situation: DialogueSituation, seed: number): string {
  const lines = DIALOGUE[situation];
  let h = (seed >>> 0) ^ 0x811c9dc5;
  for (let i = 0; i < situation.length; i++) {
    h = Math.imul(h ^ situation.charCodeAt(i), 0x01000193) >>> 0;
  }
  return lines[h % lines.length];
}
