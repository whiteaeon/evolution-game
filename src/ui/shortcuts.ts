/**
 * Pure keyboard-shortcut mapping for the game UI. Kept DOM-free so it can be
 * unit-tested in isolation; {@link UIOverlay} wires the result to actions.
 *
 *   Space → pause/play · 1/2/4 → speed · m → map · f → family tree · t → tech graph
 */
export type Shortcut =
  | { kind: "pause" }
  | { kind: "speed"; mult: number }
  | { kind: "map" }
  | { kind: "family" }
  | { kind: "tech" };

/** Map a KeyboardEvent.key to a UI action, or null if it isn't a shortcut. */
export function keyboardShortcut(key: string): Shortcut | null {
  switch (key) {
    case " ":
    case "Spacebar": // legacy key name in older browsers
      return { kind: "pause" };
    case "1":
      return { kind: "speed", mult: 1 };
    case "2":
      return { kind: "speed", mult: 2 };
    case "4":
      return { kind: "speed", mult: 4 };
    case "m":
    case "M":
      return { kind: "map" };
    case "f":
    case "F":
      return { kind: "family" };
    case "t":
    case "T":
      return { kind: "tech" };
    default:
      return null;
  }
}
