import { describe, it, expect } from "vitest";
import { keyboardShortcut } from "./shortcuts.js";

describe("keyboardShortcut", () => {
  it("maps space (both key names) to pause", () => {
    expect(keyboardShortcut(" ")).toEqual({ kind: "pause" });
    expect(keyboardShortcut("Spacebar")).toEqual({ kind: "pause" });
  });

  it("maps 1/2/4 to the matching speed multiplier", () => {
    expect(keyboardShortcut("1")).toEqual({ kind: "speed", mult: 1 });
    expect(keyboardShortcut("2")).toEqual({ kind: "speed", mult: 2 });
    expect(keyboardShortcut("4")).toEqual({ kind: "speed", mult: 4 });
  });

  it("maps m and f (any case) to map and family", () => {
    expect(keyboardShortcut("m")).toEqual({ kind: "map" });
    expect(keyboardShortcut("M")).toEqual({ kind: "map" });
    expect(keyboardShortcut("f")).toEqual({ kind: "family" });
    expect(keyboardShortcut("F")).toEqual({ kind: "family" });
  });

  it("maps t (any case) to the tech graph", () => {
    expect(keyboardShortcut("t")).toEqual({ kind: "tech" });
    expect(keyboardShortcut("T")).toEqual({ kind: "tech" });
  });

  it("ignores unmapped keys (incl. speeds the game does not offer)", () => {
    expect(keyboardShortcut("3")).toBeNull();
    expect(keyboardShortcut("a")).toBeNull();
    expect(keyboardShortcut("Enter")).toBeNull();
    expect(keyboardShortcut("Escape")).toBeNull();
  });
});
