import { describe, it, expect } from "vitest";
import { Simulation } from "../sim/index.js";
import { descendantTree, type PedNode } from "./familytree.js";

/** Run a normal game a while so a real multi-generation pedigree exists. */
function grow(seed = 3, ticks = 160): Simulation {
  const sim = new Simulation({ seed, startingPopulation: 12, startRegion: "wide-savanna" });
  for (let i = 0; i < ticks; i++) {
    sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1 });
    if (sim.state.pendingEncounter) sim.resolveEncounter(true);
    sim.tick();
  }
  return sim;
}

function flatten(node: PedNode): PedNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

describe("descendantTree", () => {
  it("returns null for an unknown focal id", () => {
    const sim = grow();
    expect(descendantTree(sim.state.individuals, -1, 6)).toBeNull();
  });

  it("roots at the focal and only includes its biological descendants", () => {
    const sim = grow();
    const all = sim.state.individuals;
    // An early-generation founder with the most descendants gives a rich tree.
    const founder = [...all]
      .filter((i) => i.motherId === undefined && i.fatherId === undefined)
      .sort(
        (a, b) =>
          all.filter((i) => i.motherId === b.id || i.fatherId === b.id).length -
          all.filter((i) => i.motherId === a.id || i.fatherId === a.id).length,
      )[0];

    const tree = descendantTree(all, founder.id, 6)!;
    expect(tree).not.toBeNull();
    expect(tree.ind.id).toBe(founder.id);

    const nodes = flatten(tree);
    expect(nodes.length).toBeGreaterThan(1); // founder actually had descendants

    // No individual is drawn twice (pedigree collapse is deduplicated).
    const ids = nodes.map((n) => n.ind.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Every non-root node has the focal among its ancestors (walk BOTH parent
    // lines — descent can run through either mother or father).
    const byId = new Map(all.map((i) => [i.id, i]));
    const hasAncestor = (startId: number, targetId: number): boolean => {
      const stack = [startId];
      const visited = new Set<number>();
      while (stack.length) {
        const cur = byId.get(stack.pop()!);
        if (!cur || visited.has(cur.id)) continue;
        visited.add(cur.id);
        if (cur.motherId === targetId || cur.fatherId === targetId) return true;
        if (cur.motherId !== undefined) stack.push(cur.motherId);
        if (cur.fatherId !== undefined) stack.push(cur.fatherId);
      }
      return false;
    };
    for (const n of nodes) {
      if (n.ind.id === founder.id) continue;
      expect(hasAncestor(n.ind.id, founder.id)).toBe(true);
    }
  });

  it("respects the depth limit and flags truncated nodes", () => {
    const sim = grow();
    const founder = [...sim.state.individuals]
      .filter((i) => i.motherId === undefined && i.fatherId === undefined)
      .sort((a, b) => a.generation - b.generation)[0];

    const shallow = descendantTree(sim.state.individuals, founder.id, 1)!;
    // depth 0 = focal, depth 1 = its children; nothing deeper than 1.
    const depthOf = (node: PedNode, d: number): number =>
      node.children.length ? Math.max(...node.children.map((c) => depthOf(c, d + 1))) : d;
    expect(depthOf(shallow, 0)).toBeLessThanOrEqual(1);

    // If a child exists but was cut off, the parent is flagged truncated.
    const anyTruncated = flatten(shallow).some((n) => n.truncated);
    const hasGrandchildren = shallow.children.some((c) =>
      sim.state.individuals.some((i) => i.motherId === c.ind.id || i.fatherId === c.ind.id),
    );
    if (hasGrandchildren) expect(anyTruncated).toBe(true);
  });
});
