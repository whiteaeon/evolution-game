import { describe, it, expect } from "vitest";
import { CC0_ART, CC0_GROUPS } from "./art-cc0-data.js";

/**
 * The CC0 art is baked into Phaser canvas textures at runtime from the base64
 * RGBA in art-cc0-data.ts (textures.ts `blit`). These specs pin the data
 * contract that baking relies on, so a bad regeneration fails here, not silently
 * as a missing texture in the browser.
 */
describe("cc0 art data", () => {
  it("every grouped key resolves to a sprite", () => {
    for (const keys of Object.values(CC0_GROUPS)) {
      for (const key of keys) {
        expect(CC0_ART[key], `missing sprite for "${key}"`).toBeDefined();
      }
    }
  });

  it("exposes the texture keys the scene references", () => {
    const biomes = ["tundra", "forest", "river", "grassland", "desert", "coast"];
    for (const b of biomes) {
      expect(CC0_ART[`grass-${b}`]).toBeDefined();
      expect(CC0_ART[`dirt-${b}`]).toBeDefined();
    }
    for (const k of ["farmland", "crop", "tree", "pine", "rock", "bush",
      "food-berry", "food-meat", "dog", "sheep", "cow",
      "shelter-cave", "shelter-hut", "shelter-village", "shelter-town",
      "shelter-city", "fire-0", "fire-1"]) {
      expect(CC0_ART[k], `missing "${k}"`).toBeDefined();
    }
  });

  it("each sprite's base64 decodes to exactly w*h*4 RGBA bytes", () => {
    for (const [key, s] of Object.entries(CC0_ART)) {
      expect(s.w, key).toBeGreaterThan(0);
      expect(s.h, key).toBeGreaterThan(0);
      const bytes = atob(s.data).length;
      expect(bytes, `${key} expected ${s.w}x${s.h} RGBA`).toBe(s.w * s.h * 4);
    }
  });
});
