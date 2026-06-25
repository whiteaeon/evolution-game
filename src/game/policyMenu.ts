/**
 * Pure, Phaser-free view-model for the WorldScene council panel (key P), which
 * surfaces the pure sim's standing {@link Policies} into the interactive game.
 * It flattens the governing axes into a flat, numbered list of selectable
 * stances — one option per stance, marked when it's the stance in force — so the
 * scene only has to render rows and route a digit/click back to setPolicy.
 * Keeping the logic here makes it unit-testable without a canvas.
 */

import { POLICY_AXES } from "../sim/policies.js";
import type { Policies, PolicyStance } from "../sim/policies.js";

/** One selectable row in the council panel. */
export interface PolicyOption {
  /** 1-based position in the flat list (drives the digit hotkey). */
  index: number;
  axisId: string;
  axisName: string;
  stance: PolicyStance;
  /** True when this stance is the one currently in force on its axis. */
  selected: boolean;
  /** True for the first stance of its axis, so the renderer can print a header. */
  axisStart: boolean;
}

/**
 * Flatten every governing axis into a numbered option list. Each axis's stances
 * appear in order; the stance currently in force is flagged `selected`. The flat
 * `index` lets the panel bind options to the number row exactly like the tech
 * panel.
 */
export function policyOptions(policies: Policies): PolicyOption[] {
  const out: PolicyOption[] = [];
  let index = 1;
  for (const axis of POLICY_AXES) {
    const currentId = policies.stanceOf(axis.id).id;
    axis.stances.forEach((stance, j) => {
      out.push({
        index: index++,
        axisId: axis.id,
        axisName: axis.name,
        stance,
        selected: stance.id === currentId,
        axisStart: j === 0,
      });
    });
  }
  return out;
}

/**
 * Describe the tribe's net evolutionary selection pressure — the product of every
 * chosen stance's {@link PolicyStance.selectionPressure} (see
 * {@link Policies.selectionPressure}). This is the one policy lever no effects
 * readout shows: >1 sharpens individual selection (the able breed truer), <1
 * flattens it (the weak are carried), 1 is the neutral default. Returns null when
 * neutral so the council header only spends a line on it when a custom bends it.
 */
export function selectionPressureLabel(pressure: number): string | null {
  const pct = Math.round(Math.abs(1 - pressure) * 100);
  if (pct === 0) return null;
  return pressure > 1
    ? `⚖ Selection sharpened +${pct}% — the able breed truer`
    : `⚖ Selection gentler −${pct}% — the weak are carried`;
}
