import { describe, expect, it } from "vitest";
import { flashEvictCount } from "./flashCap.js";

describe("flashEvictCount", () => {
  it("evicts nothing while there is room under the cap", () => {
    expect(flashEvictCount(0, 3)).toBe(0);
    expect(flashEvictCount(1, 3)).toBe(0);
    expect(flashEvictCount(2, 3)).toBe(0);
  });

  it("evicts one once a new notice would exceed the cap", () => {
    // 3 live + 1 incoming = 4 > cap 3, so the oldest must go.
    expect(flashEvictCount(3, 3)).toBe(1);
  });

  it("evicts enough to land exactly at the cap after the new notice", () => {
    // A backlog past the cap (e.g. a cap change) trims down to cap-1 + incoming.
    expect(flashEvictCount(5, 3)).toBe(3);
    expect(flashEvictCount(5, 3)).toBe(5 - 3 + 1);
  });

  it("never returns a negative count", () => {
    expect(flashEvictCount(0, 1)).toBe(0);
  });
});
