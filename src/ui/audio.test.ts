import { describe, it, expect } from "vitest";
import { eraMusic } from "./audio.js";
import { ERAS } from "../sim/index.js";

describe("eraMusic", () => {
  it("provides a distinct mode (scale) for every era", () => {
    const fingerprints = ERAS.map((_, i) => eraMusic(i).scale.join(","));
    expect(new Set(fingerprints).size).toBe(ERAS.length);
  });

  it("fills out the texture across the eras: never thinner, often fuller", () => {
    for (let i = 1; i < ERAS.length; i++) {
      const prev = eraMusic(i - 1);
      const cur = eraMusic(i);
      expect(cur.voices).toBeGreaterThanOrEqual(prev.voices); // more lines, never fewer
      expect(cur.step).toBeLessThanOrEqual(prev.step); // denser, never sparser
    }
    // Endpoints: a single sparse drone vs. a fuller, denser figure.
    const first = eraMusic(0);
    const last = eraMusic(ERAS.length - 1);
    expect(first.voices).toBe(1);
    expect(last.voices).toBeGreaterThan(first.voices);
    expect(last.step).toBeLessThan(first.step);
  });

  it("brightens the instrumentation: soft early waves, brighter late ones", () => {
    expect(eraMusic(0).wave).toBe("sine");
    expect(eraMusic(ERAS.length - 1).wave).toBe("sawtooth");
  });

  it("clamps out-of-range indices to valid eras", () => {
    expect(eraMusic(-5)).toEqual(eraMusic(0));
    expect(eraMusic(999)).toEqual(eraMusic(ERAS.length - 1));
    expect(eraMusic(2.9)).toEqual(eraMusic(2)); // floors fractional indices
  });
});
