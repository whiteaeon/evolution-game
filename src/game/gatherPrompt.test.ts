import { describe, it, expect } from "vitest";
import { gatherPromptText } from "./gatherPrompt.js";

describe("gatherPromptText", () => {
  it("shows a quiet ellipsis while the swing is on cooldown", () => {
    expect(gatherPromptText("wood", false, 5)).toBe("…");
    expect(gatherPromptText("food", false, 1)).toBe("…");
  });

  it("names the action and the remaining count when ready", () => {
    expect(gatherPromptText("wood", true, 5)).toBe("Hold Space: gather wood ×5");
    expect(gatherPromptText("stone", true, 2)).toBe("Hold Space: gather stone ×2");
  });

  it("flags the final swing instead of a count of 1", () => {
    expect(gatherPromptText("food", true, 1)).toBe("Hold Space: gather food (last)");
  });

  it("treats a non-positive remaining as the last swing", () => {
    expect(gatherPromptText("wood", true, 0)).toBe("Hold Space: gather wood (last)");
    expect(gatherPromptText("wood", true, -3)).toBe("Hold Space: gather wood (last)");
  });
});
