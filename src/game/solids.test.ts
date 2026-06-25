import { describe, it, expect } from "vitest";
import { isBlocked, removeSolid, type Solid } from "./solids.js";

describe("removeSolid", () => {
  const a: Solid = { x: 0, y: 0, r: 10 };
  const b: Solid = { x: 0, y: 0, r: 10 }; // same shape as `a`, different identity
  const c: Solid = { x: 100, y: 50, r: 30 };

  it("removes exactly the referenced solid, leaving the rest", () => {
    const out = removeSolid([a, b, c], b);
    expect(out).toEqual([a, c]);
    expect(out).toContain(a);
    expect(out).toContain(c);
    expect(out).not.toContain(b);
  });

  it("matches by identity, not by value (a twin with the same fields stays)", () => {
    // `a` and `b` are value-equal; removing `a` must not also drop `b`.
    const out = removeSolid([a, b], a);
    expect(out).toEqual([b]);
    expect(out[0]).toBe(b);
  });

  it("is a no-op for an undefined solid (non-solid node depleting)", () => {
    expect(removeSolid([a, c], undefined)).toEqual([a, c]);
  });

  it("is a no-op when the solid isn't present", () => {
    expect(removeSolid([a, c], b)).toEqual([a, c]);
  });

  it("does not mutate the input array", () => {
    const input = [a, b, c];
    removeSolid(input, b);
    expect(input).toEqual([a, b, c]);
  });
});

describe("isBlocked", () => {
  const bodyR = 7; // matches the player's foot radius
  const solids: Solid[] = [
    { x: 0, y: 0, r: 10 },
    { x: 100, y: 0, r: 30 },
  ];

  it("blocks a point overlapping a solid and clears one well away", () => {
    expect(isBlocked(12, 0, solids, bodyR)).toBe(true); // 12 < 10 + 7
    expect(isBlocked(60, 0, solids, bodyR)).toBe(false); // gap between both
  });

  it("treats the combined radius as the boundary (just inside vs just outside)", () => {
    const reach = 10 + bodyR; // 17 from the first solid's centre
    expect(isBlocked(reach - 0.01, 0, solids, bodyR)).toBe(true);
    expect(isBlocked(reach + 0.01, 0, solids, bodyR)).toBe(false);
  });

  it("is false against an empty solid set", () => {
    expect(isBlocked(0, 0, [], bodyR)).toBe(false);
  });

  it("matches the sqrt-based radius test it replaced across a grid of points", () => {
    // The optimisation drops a per-probe sqrt by comparing squared distances;
    // it must give the same verdict as `dist < s.r + bodyR` everywhere.
    const ref = (x: number, y: number) =>
      solids.some((s) => Math.hypot(x - s.x, y - s.y) < s.r + bodyR);
    for (let x = -40; x <= 140; x += 7) {
      for (let y = -40; y <= 40; y += 7) {
        expect(isBlocked(x, y, solids, bodyR)).toBe(ref(x, y));
      }
    }
  });
});
