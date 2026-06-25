import { describe, it, expect } from "vitest";
import { outbreakRisk } from "./epidemicRisk.js";

describe("outbreakRisk gauge", () => {
  it("reads ~0 when severity is fully mitigated and ~100 at the model's cap", () => {
    expect(outbreakRisk(0)).toEqual({ label: "Low", pct: 0 });
    expect(outbreakRisk(0.7)).toEqual({ label: "Severe", pct: 100 });
  });

  it("clamps out-of-range severities to the [0, cap] band", () => {
    expect(outbreakRisk(-1)).toEqual({ label: "Low", pct: 0 });
    expect(outbreakRisk(5)).toEqual({ label: "Severe", pct: 100 });
  });

  it("climbs through the bands as severity rises (Low → Moderate → High → Severe)", () => {
    const order = ["Low", "Moderate", "High", "Severe"];
    const labels = [0.0, 0.2, 0.35, 0.6].map((s) => outbreakRisk(s).label);
    // Each step is at least as high a band as the last, and the run spans all four.
    for (let i = 1; i < labels.length; i++) {
      expect(order.indexOf(labels[i])).toBeGreaterThanOrEqual(order.indexOf(labels[i - 1]));
    }
    expect(new Set(labels)).toEqual(new Set(order));
  });

  it("pct rises monotonically with severity", () => {
    const a = outbreakRisk(0.1).pct;
    const b = outbreakRisk(0.3).pct;
    const c = outbreakRisk(0.5).pct;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});
