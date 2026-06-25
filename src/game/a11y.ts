/**
 * Pure, Phaser-free accessibility data for the interactive WorldScene: the
 * controls listing shown in the help overlay (toggled with ? or H), and the
 * colourblind-safe quest-marker styling — a distinct GLYPH *and* COLOUR per
 * state, so the markers never rely on hue alone. WorldScene.ts owns the
 * rendering; keeping the content here makes it unit-testable without a canvas.
 */

/** One row in the controls/help overlay: the key(s) and what they do. */
export interface ControlHint {
  keys: string;
  action: string;
}

/** Every player action and the key(s) that trigger it — the help overlay's body. */
export const CONTROLS: readonly ControlHint[] = [
  { keys: "WASD / Arrows", action: "Move the chieftain" },
  { keys: "Space", action: "Gather from a nearby tree, bush, rock or farm" },
  { keys: "E", action: "Talk to the nearest villager (quests & lore)" },
  { keys: "1 / 2 / 3", action: "Pick a building (Campfire / Hut / Farm)" },
  { keys: "Enter", action: "Place the building · pick a reply · study" },
  { keys: "R", action: "Hold a ritual at a campfire" },
  { keys: "G", action: "Send a gift to the neighbour camp" },
  { keys: "F", action: "Rally a villager during a raid" },
  { keys: "T", action: "Open the research totem" },
  { keys: "P", action: "Open the council (standing customs / policies)" },
  { keys: "N", action: "Open the neighbours roster (rival tribes)" },
  { keys: "C", action: "Open the settlements roster (your tribe's camps)" },
  { keys: "L", action: "Toggle the quest log" },
  { keys: "M", action: "Mute / unmute sound" },
  { keys: "Esc", action: "Close a panel or cancel building" },
  { keys: "? / H", action: "Toggle this help" },
];

/**
 * Is the chieftain's movement locked right now? While the controls/help overlay
 * is open it is *modal*: the player is reading a full-screen reference card and
 * can't see the world, so the chieftain must hold still rather than keep walking
 * (with WASD or a queued click destination) off-screen behind the card. The other
 * input sites — interact/confirm/digit — already gate on the same `helpOpen` flag;
 * this gives the movement step the matching guard. Kept pure so the rule is
 * unit-testable without a canvas.
 */
export function movementLocked(helpOpen: boolean): boolean {
  return helpOpen;
}

/** A colourblind-safe marker: a distinct shape (glyph) AND colour. */
export interface MarkerStyle {
  glyph: string;
  color: string;
}

/**
 * Quest-giver marker by state. "available" and "ready" differ in BOTH glyph and
 * colour, so they are never told apart by hue alone (in greyscale the bang and
 * the check still read differently). The "done" state simply hides the marker.
 */
export const QUEST_MARKER: Record<"available" | "ready", MarkerStyle> = {
  available: { glyph: "!", color: "#ffd54a" }, // amber bang — a task on offer
  ready: { glyph: "✓", color: "#6fe07a" }, // green check — ready to turn in
};

/**
 * Build-placement affordability marker, shown on the ghost footprint. "ok" and
 * "blocked" differ in BOTH glyph and colour so the can-I-afford-this read never
 * relies on red-vs-green hue alone (the most common colourblindness) — in
 * greyscale the check and the cross still read apart.
 */
export const BUILD_MARKER: Record<"ok" | "blocked", MarkerStyle> = {
  ok: { glyph: "✓", color: "#6fe07a" }, // green check — affordable, place here
  blocked: { glyph: "✕", color: "#ff5a5a" }, // red cross — can't afford it
};
