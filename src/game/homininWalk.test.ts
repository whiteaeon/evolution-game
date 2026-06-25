import { describe, it, expect } from "vitest";
import { HOMININ_POSES, HOMININ_WALK, homininFrameKey } from "./homininWalk.js";

/**
 * The hominin sprite plays a multi-beat walk cycle, but textures must stay
 * deduped per morph signature (one texture per pose, not per playback frame).
 * These specs pin that contract without needing a Phaser canvas.
 */
describe("hominin walk cycle", () => {
  it("plays more than the original 2 frames", () => {
    expect(HOMININ_WALK.length).toBeGreaterThan(2);
  });

  it("only references baked poses, and exercises every one", () => {
    for (const pose of HOMININ_WALK) {
      expect(pose).toBeGreaterThanOrEqual(0);
      expect(pose).toBeLessThan(HOMININ_POSES);
    }
    const used = new Set<number>(HOMININ_WALK);
    for (let p = 0; p < HOMININ_POSES; p++) {
      expect(used.has(p), `pose ${p} is baked but never shown`).toBe(true);
    }
  });

  it("bakes exactly HOMININ_POSES distinct texture keys per morph", () => {
    const keys = new Set(
      Array.from({ length: HOMININ_POSES }, (_, p) => homininFrameKey("hom_sig", p)),
    );
    expect(keys.size).toBe(HOMININ_POSES);
  });

  it("reuses the base key for pose 0 so it is not baked twice", () => {
    expect(homininFrameKey("hom_sig", 0)).toBe("hom_sig");
    expect(homininFrameKey("hom_sig", 1)).toBe("hom_sig_1");
  });

  it("dedupes frames across individuals sharing a morph signature", () => {
    // Same signature -> identical frame keys for every beat -> shared textures.
    const a = HOMININ_WALK.map((p) => homininFrameKey("hom_2_4_2_0_3_3_x", p));
    const b = HOMININ_WALK.map((p) => homininFrameKey("hom_2_4_2_0_3_3_x", p));
    expect(a).toEqual(b);
  });
});
