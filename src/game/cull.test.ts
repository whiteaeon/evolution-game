import { describe, it, expect } from "vitest";
import { isPointVisible, type ViewRect } from "./cull.js";

const view: ViewRect = { x: 100, y: 50, width: 640, height: 360 };

describe("isPointVisible", () => {
  it("is true for points inside the view and false for points well outside", () => {
    expect(isPointVisible(400, 200, view)).toBe(true);
    expect(isPointVisible(-500, 200, view)).toBe(false);
    expect(isPointVisible(400, 5000, view)).toBe(false);
  });

  it("treats the exact edges as visible", () => {
    expect(isPointVisible(view.x, view.y, view)).toBe(true);
    expect(isPointVisible(view.x + view.width, view.y + view.height, view)).toBe(true);
  });

  it("a point just past an edge is culled without a margin but kept within it", () => {
    const justRight = view.x + view.width + 30;
    expect(isPointVisible(justRight, 200, view)).toBe(false);
    expect(isPointVisible(justRight, 200, view, 48)).toBe(true);
    // still culled once it clears the margin too
    expect(isPointVisible(view.x + view.width + 60, 200, view, 48)).toBe(false);
  });
});
