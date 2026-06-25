import { describe, it, expect } from "vitest";
import { movePingColor } from "./movePingColor.js";

const RES_COLOR = { wood: 0xb5793b, food: 0x6fcf57, stone: 0xc2c6cf };
const WALK = 0xfff2c8;

describe("click-to-move ping colour", () => {
  it("uses the calm walk colour for a plain ground order", () => {
    expect(movePingColor(null, RES_COLOR, WALK)).toBe(WALK);
  });

  it("tints the ping to the clicked node's resource colour", () => {
    expect(movePingColor("wood", RES_COLOR, WALK)).toBe(RES_COLOR.wood);
    expect(movePingColor("food", RES_COLOR, WALK)).toBe(RES_COLOR.food);
    expect(movePingColor("stone", RES_COLOR, WALK)).toBe(RES_COLOR.stone);
  });

  it("gives each resource a distinct ping, all distinct from a plain walk", () => {
    const colours = [
      movePingColor(null, RES_COLOR, WALK),
      movePingColor("wood", RES_COLOR, WALK),
      movePingColor("food", RES_COLOR, WALK),
      movePingColor("stone", RES_COLOR, WALK),
    ];
    expect(new Set(colours).size).toBe(4); // no two orders ping the same colour
  });
});
