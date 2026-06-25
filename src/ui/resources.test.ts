import { describe, it, expect } from "vitest";
import { resourcesPanelHTML, type ResourceView } from "./resources.js";

const base: ResourceView = {
  food: 20,
  wood: 16,
  stone: 4,
  hide: 2,
  prod: { wood: 0.7, stone: 0.5, hide: 0 },
  shelter: "cave",
  regionName: "Frostvale",
  biome: "tundra",
  cooking: false,
  gate: null,
};

describe("resourcesPanelHTML", () => {
  it("shows each raw-resource stock floored next to its label", () => {
    const html = resourcesPanelHTML({ ...base, wood: 16.8, stone: 4.2, hide: 2.9 });
    expect(html).toContain("Wood <b>16</b>");
    expect(html).toContain("Stone <b>4</b>");
    expect(html).toContain("Hide <b>2</b>");
    expect(html).toContain("🍖 Food <b>20</b>");
  });

  it("shows production for resources that are flowing and hides it otherwise", () => {
    const html = resourcesPanelHTML(base);
    expect(html).toContain("Wood <b>16</b> <span class=\"prod\">+0.7/yr</span>");
    expect(html).toContain("Stone <b>4</b> <span class=\"prod\">+0.5/yr</span>");
    // hide production is 0 → no rate appended right after the hide stock.
    expect(html).toContain("Hide <b>2</b><span class='sep'>");
    expect(html).not.toContain("+0.0/yr");
  });

  it("renders the shelter, region and cooking summary", () => {
    const html = resourcesPanelHTML({ ...base, shelter: "hut", cooking: true });
    expect(html).toContain("🏠 Hut");
    expect(html).toContain("🗺 Frostvale");
    expect(html).toContain("(tundra)");
    expect(html).toContain("cooking ✓");
  });

  it("spells out a research resource-gate, naming the shortfall", () => {
    const html = resourcesPanelHTML({
      ...base,
      stone: 8,
      gate: { label: "Bronzeworking", needs: [{ resource: "stone", amount: 8 }] },
    });
    expect(html).toContain("resgate");
    expect(html).toContain("Bronzeworking needs 8 Stone 🪨");
  });

  it("omits the gate line when nothing is blocked", () => {
    expect(resourcesPanelHTML(base)).not.toContain("resgate");
  });
});
