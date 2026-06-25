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
  { keys: "L", action: "Toggle the quest log" },
  { keys: "M", action: "Mute / unmute sound" },
  { keys: "Esc", action: "Close a panel or cancel building" },
  { keys: "? / H", action: "Toggle this help" },
];

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
