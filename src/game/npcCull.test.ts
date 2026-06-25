import { describe, it, expect } from "vitest";
import { NPC_CULL_MARGIN, npcOnScreen } from "./npcCull.js";
import type { ViewRect } from "./cull.js";

const view: ViewRect = { x: 100, y: 50, width: 640, height: 360 };

describe("npcOnScreen", () => {
  it("animates villagers inside the view and skips ones well outside", () => {
    expect(npcOnScreen(400, 200, view)).toBe(true);
    expect(npcOnScreen(-500, 200, view)).toBe(false);
    expect(npcOnScreen(400, 5000, view)).toBe(false);
  });

  it("keeps animating a villager just off-screen but within the cull margin", () => {
    const justPast = view.x + view.width + (NPC_CULL_MARGIN - 1);
    expect(npcOnScreen(justPast, 200, view)).toBe(true);
  });

  it("stops animating once the villager clears the cull margin", () => {
    const beyond = view.x + view.width + (NPC_CULL_MARGIN + 1);
    expect(npcOnScreen(beyond, 200, view)).toBe(false);
  });
});
