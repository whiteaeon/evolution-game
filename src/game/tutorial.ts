/**
 * Pure, Phaser-free state for the first-run tutorial, so the step-advancement
 * rule can be unit-tested without a canvas. WorldScene.ts owns the overlay and
 * fires {@link TutorialEvent}s as the player acts; this decides when a step is
 * cleared. Keep it free of Phaser; the localStorage IO at the bottom is the only
 * DOM touch and is guarded so it degrades to "never seen" when storage is gone.
 */

/** Player actions the tutorial watches for, one per step in order. */
export type TutorialEvent = "move" | "gather" | "build" | "quest";

export interface TutorialStep {
  /** The action that clears this step. */
  event: TutorialEvent;
  /** What the player is told to do. */
  text: string;
}

/** The core loop, taught one step at a time on a fresh run only. */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { event: "move", text: "Move with WASD, or click the ground to walk there." },
  { event: "gather", text: "Walk up to a tree and press Space to gather wood." },
  { event: "build", text: "Press 2 (or click the build bar, bottom-left) to pick the Hut, then Enter or click to place it." },
  { event: "quest", text: "Find a villager marked ! — press E nearby, or click them — to take a quest." },
];

/**
 * Advance past the current step when the player's action matches its trigger.
 * Returns the new step index — equal to {@link TUTORIAL_STEPS}.length once the
 * tutorial is complete. Unrelated events leave the index unchanged.
 */
export function advanceTutorial(step: number, event: TutorialEvent): number {
  if (step >= 0 && step < TUTORIAL_STEPS.length && TUTORIAL_STEPS[step].event === event) {
    return step + 1;
  }
  return step;
}

// ── localStorage IO ──────────────────────────────────────────────────────────

const KEY = "dawn-of-the-tribe-tutorial-seen";

/** Has the player already finished or skipped the tutorial? */
export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Remember that the tutorial is done, so it never reappears. */
export function markTutorialSeen(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* storage unavailable — the tutorial just shows again next time */
  }
}
