import { describe, it, expect } from "vitest";
import type { PendingChoice, RivalTribe } from "../sim/index.js";
import { dispositionStyle, diplomacyPanelHTML } from "./diplomacy.js";

function rival(over: Partial<RivalTribe> = {}): RivalTribe {
  return {
    id: "rival-deepwood",
    name: "the Ashfolk",
    homeRegion: "deepwood",
    biome: "forest",
    population: 12,
    strength: 0.4,
    eraIndex: 0,
    techProgress: 0,
    disposition: 0,
    relations: 0,
    ...over,
  };
}

describe("dispositionStyle", () => {
  it("buckets the [-1,1] range into distinct styles at the thresholds", () => {
    expect(dispositionStyle(-1).key).toBe("hostile");
    expect(dispositionStyle(-0.5).key).toBe("hostile");
    expect(dispositionStyle(-0.49).key).toBe("wary");
    expect(dispositionStyle(-0.15).key).toBe("neutral");
    expect(dispositionStyle(0).key).toBe("neutral");
    expect(dispositionStyle(0.15).key).toBe("neutral");
    expect(dispositionStyle(0.16).key).toBe("cordial");
    expect(dispositionStyle(0.49).key).toBe("cordial");
    expect(dispositionStyle(0.5).key).toBe("friendly");
    expect(dispositionStyle(1).key).toBe("friendly");
  });

  it("gives each style a colour and an icon", () => {
    for (const d of [-1, -0.3, 0, 0.3, 1]) {
      const s = dispositionStyle(d);
      expect(s.color).toMatch(/^#/);
      expect(s.icon.length).toBeGreaterThan(0);
    }
  });
});

const regionName = (id: string) => (id === "deepwood" ? "Deepwood" : id);

describe("diplomacyPanelHTML", () => {
  it("renders a message when there are no neighbours", () => {
    expect(diplomacyPanelHTML([], regionName, null)).toContain("No neighbours");
  });

  it("lists each rival with its name, region and relations, tagged by disposition", () => {
    const html = diplomacyPanelHTML([rival({ disposition: -0.8, relations: -0.4 })], regionName, null);
    expect(html).toContain("the Ashfolk");
    expect(html).toContain("Deepwood");
    expect(html).toContain("-0.40");
    expect(html).toContain('data-disp="hostile"');
  });

  it("labels the relations bar with a tooltip so the bare score reads as relations", () => {
    const html = diplomacyPanelHTML([rival({ relations: -0.4 })], regionName, null);
    expect(html).toContain('title="Relations — the standing you\'ve built through diplomacy, from −1 to +1"');
  });

  it("exposes the disposition icon to screen readers as an aria-labelled image", () => {
    const html = diplomacyPanelHTML([rival({ disposition: -0.8 })], regionName, null);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Hostile"');
  });

  it("shows no action buttons when there is no pending offer", () => {
    const html = diplomacyPanelHTML([rival()], regionName, null);
    expect(html).not.toContain("data-act=");
  });

  it("renders the two offer responses, wired to diplo-0/diplo-1, for the matching rival", () => {
    const pending: PendingChoice = {
      id: "diploGift",
      title: "A neighbour's gift",
      message: "m",
      options: [
        { label: "Send a gift in return", hint: "" },
        { label: "Keep it, give nothing", hint: "" },
      ],
      expiresTick: 10,
      rivalId: "rival-deepwood",
    };
    const html = diplomacyPanelHTML([rival()], regionName, pending);
    expect(html).toContain("A neighbour's gift");
    expect(html).toContain('data-act="diplo-0"');
    expect(html).toContain("Send a gift in return");
    expect(html).toContain('data-act="diplo-1"');
    expect(html).toContain("Keep it, give nothing");
  });

  it("does not attach an offer to a rival the pending choice is not about", () => {
    const pending: PendingChoice = {
      id: "diploGift",
      title: "A neighbour's gift",
      message: "m",
      options: [
        { label: "a", hint: "" },
        { label: "b", hint: "" },
      ],
      expiresTick: 10,
      rivalId: "rival-elsewhere",
    };
    const html = diplomacyPanelHTML([rival()], regionName, pending);
    expect(html).not.toContain("data-act=");
  });
});
