import { describe, it, expect } from "vitest";
import { codexHTML } from "./codex.js";
import { CODEX_ENTRIES, type CodexContext } from "../sim/index.js";

const emptyCtx: CodexContext = {
  discoveredTechs: new Set(),
  visitedBiomes: [],
  interbredLineages: [],
  seenEventChains: [],
};

describe("codexHTML", () => {
  it("renders nothing when no entry is discovered", () => {
    expect(codexHTML(CODEX_ENTRIES, emptyCtx)).toBe("");
  });

  it("renders a discovered entry's title and lore, grouped by category", () => {
    const ctx: CodexContext = { ...emptyCtx, discoveredTechs: new Set(["fire"]), visitedBiomes: ["tundra"] };
    const fire = CODEX_ENTRIES.find((e) => e.category === "tech" && e.id === "fire")!;
    const tundra = CODEX_ENTRIES.find((e) => e.category === "biome" && e.id === "tundra")!;
    const html = codexHTML(CODEX_ENTRIES, ctx);
    expect(html).toContain(fire.title);
    expect(html).toContain(fire.lore);
    expect(html).toContain(tundra.lore);
    expect(html).toContain("Technologies");
    expect(html).toContain("Biomes");
  });

  it("omits undiscovered entries", () => {
    const ctx: CodexContext = { ...emptyCtx, discoveredTechs: new Set(["fire"]) };
    const cooking = CODEX_ENTRIES.find((e) => e.category === "tech" && e.id === "cooking")!;
    const html = codexHTML(CODEX_ENTRIES, ctx);
    expect(html).not.toContain(cooking.lore);
  });
});
