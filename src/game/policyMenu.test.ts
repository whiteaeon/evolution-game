import { describe, it, expect } from "vitest";
import { Policies, POLICY_AXES } from "../sim/policies.js";
import { policyOptions, selectionPressureLabel } from "./policyMenu.js";

describe("policyMenu — council panel view-model", () => {
  it("lists every stance of every axis as a contiguously-numbered option", () => {
    const opts = policyOptions(new Policies());
    const totalStances = POLICY_AXES.reduce((n, a) => n + a.stances.length, 0);
    expect(opts).toHaveLength(totalStances);
    // Indices are 1..N with no gaps, in axis order.
    expect(opts.map((o) => o.index)).toEqual(opts.map((_, i) => i + 1));
    // Every axis is represented.
    expect(new Set(opts.map((o) => o.axisId))).toEqual(new Set(POLICY_AXES.map((a) => a.id)));
  });

  it("marks the balanced default selected on a fresh, unset tribe", () => {
    const opts = policyOptions(new Policies());
    for (const axis of POLICY_AXES) {
      const selected = opts.filter((o) => o.axisId === axis.id && o.selected);
      expect(selected).toHaveLength(1);
      expect(selected[0].stance.id).toBe(axis.stances[0].id); // stances[0] is the default
    }
  });

  it("tracks the stance the player adopts via the sim", () => {
    const policies = new Policies();
    policies.set("social", "communal");
    const social = policyOptions(policies).filter((o) => o.axisId === "social");
    const selected = social.find((o) => o.selected)!;
    expect(selected.stance.id).toBe("communal");
    expect(social.filter((o) => o.selected)).toHaveLength(1); // exactly one in force
  });

  it("flags the first stance of each axis as an axis header start", () => {
    const opts = policyOptions(new Policies());
    const starts = opts.filter((o) => o.axisStart);
    expect(starts).toHaveLength(POLICY_AXES.length);
    expect(starts.map((o) => o.axisId)).toEqual(POLICY_AXES.map((a) => a.id));
  });
});

describe("selectionPressureLabel — net selection-pressure readout", () => {
  it("returns null at the neutral default, so the header spends no line on it", () => {
    expect(selectionPressureLabel(new Policies().selectionPressure())).toBeNull();
    expect(selectionPressureLabel(1)).toBeNull();
  });

  it("reports a sharpened selection (>1) with the deviation as a percentage", () => {
    const policies = new Policies();
    policies.set("social", "competitive"); // selectionPressure 1.3
    const label = selectionPressureLabel(policies.selectionPressure());
    expect(label).toContain("sharpened");
    expect(label).toContain("+30%");
  });

  it("reports a gentler selection (<1) with the deviation as a percentage", () => {
    const policies = new Policies();
    policies.set("social", "communal"); // selectionPressure 0.85
    const label = selectionPressureLabel(policies.selectionPressure());
    expect(label).toContain("gentler");
    expect(label).toContain("−15%"); // U+2212 minus, matching the readout
  });

  it("tracks the product of stances across axes the player adopts", () => {
    const policies = new Policies();
    policies.set("social", "competitive"); // 1.3; the settlement axis stays neutral (1)
    // The label reflects selectionPressure()'s product, not a single stance.
    expect(selectionPressureLabel(policies.selectionPressure())).toBe(
      selectionPressureLabel(1.3),
    );
  });
});
