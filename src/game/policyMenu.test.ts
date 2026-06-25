import { describe, it, expect } from "vitest";
import { Policies, POLICY_AXES } from "../sim/policies.js";
import { policyOptions } from "./policyMenu.js";

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
