import { describe, it, expect } from "vitest";
import { gatherPulseTint } from "./gatherPulse.js";

const FROM = 0xffd27a; // the resting highlight
const TO = 0xfff0d0; // the brighter peak

describe("aimed-node highlight pulse", () => {
  it("rests exactly on the base tint at the start of the cycle", () => {
    expect(gatherPulseTint(0, 900, FROM, TO)).toBe(FROM);
  });

  it("reaches the bright peak at the half-period", () => {
    expect(gatherPulseTint(450, 900, FROM, TO)).toBe(TO);
  });

  it("breathes back to the base tint at the full period", () => {
    expect(gatherPulseTint(900, 900, FROM, TO)).toBe(FROM);
  });

  it("eases between the two tones — a mid-quarter sits strictly inside the range", () => {
    const mid = gatherPulseTint(225, 900, FROM, TO);
    const g = (mid >> 8) & 0xff;
    expect(g).toBeGreaterThan((FROM >> 8) & 0xff);
    expect(g).toBeLessThan((TO >> 8) & 0xff);
  });

  it("is periodic — the same phase one cycle later gives the same tint", () => {
    expect(gatherPulseTint(1125, 900, FROM, TO)).toBe(gatherPulseTint(225, 900, FROM, TO));
  });
});
