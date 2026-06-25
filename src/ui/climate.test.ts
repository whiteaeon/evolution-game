import { describe, it, expect } from "vitest";
import { climateReadout } from "./climate.js";

describe("climateReadout", () => {
  it("shows the chill as a percentage and the abundance as a food multiplier", () => {
    const line = climateReadout(0.34, 0.82);
    expect(line).toContain("🌡 34%");
    expect(line).toContain("🌾 ×0.82");
  });

  it("flags a harsh winter once cold crosses the sim's hard-winter threshold", () => {
    expect(climateReadout(0.62, 0.7)).toContain("harsh");
    expect(climateReadout(0.5, 0.7)).not.toContain("harsh"); // 0.5 is not yet harsh (strictly >)
  });

  it("clamps the chill into 0..100% even if cold is out of range", () => {
    expect(climateReadout(1.4, 1)).toContain("🌡 100%");
    expect(climateReadout(-0.2, 1)).toContain("🌡 0%");
  });

  it("keeps abundance to two decimals so a rich summer reads distinctly", () => {
    expect(climateReadout(0.1, 1.27)).toContain("🌾 ×1.27");
  });
});
