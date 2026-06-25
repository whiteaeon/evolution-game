import { describe, it, expect } from "vitest";
import { CONTROLS, QUEST_MARKER } from "./a11y.js";

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

  it("has no blank rows", () => {
    for (const c of CONTROLS) {
      expect(c.keys.trim().length).toBeGreaterThan(0);
      expect(c.action.trim().length).toBeGreaterThan(0);
    }
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
