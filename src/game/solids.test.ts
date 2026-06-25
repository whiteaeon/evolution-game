import { describe, it, expect } from "vitest";
import { removeSolid, type Solid } from "./solids.js";

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
