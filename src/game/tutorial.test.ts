import { describe, it, expect } from "vitest";
import { advanceTutorial, TUTORIAL_STEPS, type TutorialEvent } from "./tutorial.js";

describe("advanceTutorial", () => {
  it("advances only when the event matches the current step's trigger", () => {
    expect(advanceTutorial(0, "move")).toBe(1);
    // A non-matching event leaves the step where it is.
    expect(advanceTutorial(0, "gather")).toBe(0);
    expect(advanceTutorial(0, "build")).toBe(0);
    expect(advanceTutorial(0, "quest")).toBe(0);
  });

  it("walks the whole core loop in order to completion", () => {
    let step = 0;
    for (const expected of TUTORIAL_STEPS) {
      step = advanceTutorial(step, expected.event);
    }
    expect(step).toBe(TUTORIAL_STEPS.length); // past the last step = complete
  });

  it("does not advance past completion or from an inactive (-1) index", () => {
    expect(advanceTutorial(TUTORIAL_STEPS.length, "quest")).toBe(TUTORIAL_STEPS.length);
    expect(advanceTutorial(-1, "move")).toBe(-1);
  });

  it("the steps cover the documented core loop in order", () => {
    const order = TUTORIAL_STEPS.map((s) => s.event);
    expect(order).toEqual<TutorialEvent[]>(["move", "gather", "build", "quest"]);
  });

  it("teaches a keyboard-only path for every step (no mouse-only instruction)", () => {
    const byEvent = (e: TutorialEvent) => TUTORIAL_STEPS.find((s) => s.event === e)!.text;
    // Move/gather already cite keys; build and quest must also name their keys,
    // so a player without a mouse is never stranded mid-tutorial.
    expect(byEvent("move")).toMatch(/wasd/i);
    expect(byEvent("gather")).toMatch(/space/i);
    expect(byEvent("build")).toMatch(/\b2\b/); // pick the Hut from the keyboard
    expect(byEvent("build")).toMatch(/enter/i); // place it from the keyboard
    expect(byEvent("quest")).toMatch(/\bE\b/); // talk to a villager from the keyboard
  });
});
