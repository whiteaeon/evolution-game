import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import { REGIONS, regionNeighbors, NEIGHBOR_RADIUS, regionDistance } from "./regions.js";

describe("region discovery (fog of war)", () => {
  it("starts with the homeland and its neighbours discovered, the rest under fog", () => {
    const sim = new Simulation({ seed: 1, startRegion: "frostvale" });
    const discovered = new Set(sim.state.discovered);

    expect(discovered.has("frostvale")).toBe(true);
    for (const id of regionNeighbors("frostvale")) expect(discovered.has(id)).toBe(true);

    // Fog of war only means something if some regions begin hidden.
    const hidden = REGIONS.filter((r) => !discovered.has(r.id));
    expect(hidden.length).toBeGreaterThan(0);
  });

  it("migrating reveals the destination and its neighbours", () => {
    const sim = new Simulation({ seed: 1, startRegion: "frostvale" });
    const target = "sunscar";
    expect(sim.state.discovered).not.toContain(target);

    sim.migrate(target);

    expect(sim.state.discovered).toContain(target);
    for (const id of regionNeighbors(target)) expect(sim.state.discovered).toContain(id);
  });

  it("neighbours are exactly the regions within NEIGHBOR_RADIUS, and the world is one connected graph", () => {
    for (const r of REGIONS) {
      for (const id of regionNeighbors(r.id)) {
        expect(regionDistance(r.id, id)).toBeLessThanOrEqual(NEIGHBOR_RADIUS);
      }
    }
    // Flood-fill from the homeland: every region must be reachable by migrating.
    const seen = new Set(["frostvale"]);
    const queue = ["frostvale"];
    while (queue.length) {
      for (const n of regionNeighbors(queue.shift()!)) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(REGIONS.length);
  });

  it("survives a save / load round-trip", () => {
    const a = new Simulation({ seed: 7, startRegion: "frostvale" });
    a.migrate("sunscar"); // discover more than the initial set
    const before = [...a.state.discovered].sort();

    const b = Simulation.load(a.serialize());
    expect([...b.state.discovered].sort()).toEqual(before);
  });

  it("loading a pre-fog save falls back to the current region", () => {
    const a = new Simulation({ seed: 3, startRegion: "deepwood" });
    const raw = JSON.parse(a.serialize());
    delete raw.state.discovered; // simulate an older save

    const b = Simulation.load(JSON.stringify(raw));
    expect(b.state.discovered).toEqual(["deepwood"]);
  });
});
