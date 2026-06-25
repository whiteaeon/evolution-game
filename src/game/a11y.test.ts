import { describe, it, expect } from "vitest";
import {
  CONTROLS,
  QUEST_MARKER,
  QUEST_MARKER_LEGEND,
  BUILD_MARKER,
  BUILD_MARKER_LEGEND,
  INSPECT_MARKER,
  INSPECT_MARKER_LEGEND,
  movementLocked,
} from "./a11y.js";

describe("CONTROLS help listing", () => {
  it("documents every core keyboard-only action", () => {
    const actions = CONTROLS.map((c) => c.action.toLowerCase()).join(" | ");
    expect(actions).toMatch(/move/);
    expect(actions).toMatch(/gather/);
    expect(actions).toMatch(/talk/);
    expect(actions).toMatch(/building/);
  });

  it("binds every core action to a key", () => {
    const keys = CONTROLS.map((c) => c.keys.toLowerCase()).join(" | ");
    expect(keys).toMatch(/wasd/);
    expect(keys).toMatch(/space/);
    expect(keys).toMatch(/\be\b/); // talk
    expect(keys).toMatch(/1 \/ 2 \/ 3/); // build
    expect(keys).toMatch(/enter/); // place / confirm
    expect(keys).toMatch(/\?/); // help itself
  });

  it("binds keyboard-only inspection of leaders/notables to I", () => {
    const inspect = CONTROLS.find((c) => /inspect/i.test(c.action));
    expect(inspect).toBeDefined();
    expect(inspect!.keys).toMatch(/\bi\b/i);
  });

  it("has no blank rows", () => {
    for (const c of CONTROLS) {
      expect(c.keys.trim().length).toBeGreaterThan(0);
      expect(c.action.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("movementLocked (help overlay is modal)", () => {
  it("locks the chieftain's movement while the help overlay is open", () => {
    expect(movementLocked(true)).toBe(true);
  });

  it("leaves movement free when the help overlay is closed", () => {
    expect(movementLocked(false)).toBe(false);
  });
});

describe("QUEST_MARKER colourblind safety", () => {
  it("distinguishes available vs ready by BOTH glyph and colour", () => {
    expect(QUEST_MARKER.available.glyph).not.toBe(QUEST_MARKER.ready.glyph);
    expect(QUEST_MARKER.available.color).not.toBe(QUEST_MARKER.ready.color);
  });

  it("uses non-empty glyphs and valid hex colours", () => {
    for (const m of Object.values(QUEST_MARKER)) {
      expect(m.glyph.length).toBeGreaterThan(0);
      expect(m.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("QUEST_MARKER_LEGEND (help overlay explains the markers)", () => {
  it("covers both visible quest-marker states", () => {
    expect(QUEST_MARKER_LEGEND.length).toBe(2);
  });

  it("stays in sync with QUEST_MARKER's glyphs and colours", () => {
    const styles = QUEST_MARKER_LEGEND.map((e) => `${e.glyph}|${e.color}`);
    expect(styles).toContain(`${QUEST_MARKER.available.glyph}|${QUEST_MARKER.available.color}`);
    expect(styles).toContain(`${QUEST_MARKER.ready.glyph}|${QUEST_MARKER.ready.color}`);
  });

  it("gives every marker a non-empty plain-language meaning", () => {
    for (const e of QUEST_MARKER_LEGEND) {
      expect(e.meaning.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("BUILD_MARKER_LEGEND (help overlay explains the build glyph)", () => {
  it("covers both build-affordability states", () => {
    expect(BUILD_MARKER_LEGEND.length).toBe(2);
  });

  it("stays in sync with BUILD_MARKER's glyphs and colours", () => {
    const styles = BUILD_MARKER_LEGEND.map((e) => `${e.glyph}|${e.color}`);
    expect(styles).toContain(`${BUILD_MARKER.ok.glyph}|${BUILD_MARKER.ok.color}`);
    expect(styles).toContain(`${BUILD_MARKER.blocked.glyph}|${BUILD_MARKER.blocked.color}`);
  });

  it("gives every marker a non-empty plain-language meaning", () => {
    for (const e of BUILD_MARKER_LEGEND) {
      expect(e.meaning.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("BUILD_MARKER colourblind safety", () => {
  it("distinguishes affordable vs blocked by BOTH glyph and colour", () => {
    expect(BUILD_MARKER.ok.glyph).not.toBe(BUILD_MARKER.blocked.glyph);
    expect(BUILD_MARKER.ok.color).not.toBe(BUILD_MARKER.blocked.color);
  });

  it("uses non-empty glyphs and valid hex colours", () => {
    for (const m of Object.values(BUILD_MARKER)) {
      expect(m.glyph.length).toBeGreaterThan(0);
      expect(m.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("INSPECT_MARKER colourblind safety", () => {
  it("distinguishes leader vs notable by BOTH glyph and colour", () => {
    expect(INSPECT_MARKER.leader.glyph).not.toBe(INSPECT_MARKER.notable.glyph);
    expect(INSPECT_MARKER.leader.color).not.toBe(INSPECT_MARKER.notable.color);
  });

  it("uses non-empty glyphs and valid hex colours", () => {
    for (const m of Object.values(INSPECT_MARKER)) {
      expect(m.glyph.length).toBeGreaterThan(0);
      expect(m.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("INSPECT_MARKER_LEGEND (help overlay explains the 👑/✦ markers)", () => {
  it("covers both inspect-marker states", () => {
    expect(INSPECT_MARKER_LEGEND.length).toBe(2);
  });

  it("stays in sync with INSPECT_MARKER's glyphs and colours", () => {
    const styles = INSPECT_MARKER_LEGEND.map((e) => `${e.glyph}|${e.color}`);
    expect(styles).toContain(`${INSPECT_MARKER.leader.glyph}|${INSPECT_MARKER.leader.color}`);
    expect(styles).toContain(`${INSPECT_MARKER.notable.glyph}|${INSPECT_MARKER.notable.color}`);
  });

  it("tells the keyboard-only player that I inspects each marker", () => {
    for (const e of INSPECT_MARKER_LEGEND) {
      expect(e.meaning.trim().length).toBeGreaterThan(0);
      expect(e.meaning).toMatch(/\bI\b/); // the inspect key, so no mouse is required
    }
  });
});
