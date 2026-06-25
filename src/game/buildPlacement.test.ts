import { describe, expect, it } from "vitest";
import { checkPlacement } from "./buildPlacement.js";

describe("checkPlacement", () => {
  it("allows an affordable build on a clear tile", () => {
    expect(checkPlacement(true, false, "wood")).toEqual({ ok: true, reason: "" });
  });

  it("refuses an unaffordable build and names the resource", () => {
    expect(checkPlacement(false, false, "stone")).toEqual({
      ok: false,
      reason: "Not enough stone",
    });
  });

  it("refuses an affordable build that overlaps a solid", () => {
    const res = checkPlacement(true, true, "wood");
    expect(res.ok).toBe(false);
    expect(res.reason).toContain("Blocked");
  });

  it("reports affordability before overlap when both fail", () => {
    // Can't pay AND the spot is taken — gather-more is the actionable first read.
    expect(checkPlacement(false, true, "food")).toEqual({
      ok: false,
      reason: "Not enough food",
    });
  });
});
