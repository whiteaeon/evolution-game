import { describe, it, expect } from "vitest";
import { eraMusic, WorldAudio } from "./audio.js";
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

describe("WorldAudio", () => {
  it("starts unmuted and the toggle flips and reports the state", () => {
    const a = new WorldAudio();
    expect(a.muted).toBe(false);
    expect(a.toggleMute()).toBe(true);
    expect(a.muted).toBe(true);
    expect(a.toggleMute()).toBe(false);
    expect(a.muted).toBe(false);
  });

  it("is a safe no-op without WebAudio: no method throws, muted or not", () => {
    // The node test env has no `window`/AudioContext, so every call should fall
    // through harmlessly — proving the facility never crashes the scene.
    const exercise = (a: WorldAudio) => {
      a.resume();
      a.footstep();
      a.gather("wood");
      a.gather("stone");
      a.build(true);
      a.build(false);
      a.questAccept();
      a.questComplete();
      a.raidWarn();
      a.raidResolve(true);
      a.raidResolve(false);
      a.setBiome("forest");
      a.setBiome("desert");
      a.setTimeOfDay(0.5);
      a.setTimeOfDay(0.0);
    };
    const a = new WorldAudio();
    expect(() => exercise(a)).not.toThrow();
    a.toggleMute(); // muted
    expect(() => exercise(a)).not.toThrow();
  });
});
