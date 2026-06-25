import { describe, it, expect } from "vitest";
import {
  selectLeader,
  leaderTrait,
  leaderBonus,
  LEADER_BONUS_SCALE,
  LEADER_STYLE,
} from "./leadership.js";
import { makeGenome } from "./genome.js";
import { Simulation } from "./simulation.js";
import { type Genome, type Individual } from "./types.js";

let nextId = 1;
function person(
  over: Omit<Partial<Individual>, "genome"> & { genome?: Partial<Genome> } = {},
): Individual {
  const genome = makeGenome((t) => over.genome?.[t as keyof Genome] ?? 0.4);
  return {
    id: over.id ?? nextId++,
    genome,
    sex: over.sex ?? "f",
    age: over.age ?? 20,
    generation: over.generation ?? 0,
    motherId: over.motherId,
    fatherId: over.fatherId,
    lineage: over.lineage,
    food: 0.7,
    warmth: 0.7,
    health: 0.8,
    alive: over.alive ?? true,
    ateCooked: false,
  };
}

describe("selectLeader", () => {
  it("returns null for an empty population", () => {
    expect(selectLeader([])).toBeNull();
  });

  it("picks the individual with the highest combined governing-trait score", () => {
    const weak = person({ id: 1, genome: { strength: 0.1, intelligence: 0.1, speech: 0.1 } });
    const strong = person({ id: 2, genome: { strength: 0.9, intelligence: 0.8, speech: 0.7 } });
    const mid = person({ id: 3, genome: { strength: 0.5, intelligence: 0.5, speech: 0.5 } });
    expect(selectLeader([weak, strong, mid])).toBe(2);
  });

  it("only counts the three governing traits, not other genome fields", () => {
    // Equal governing traits; a higher dexterity must NOT win leadership.
    const a = person({
      id: 10,
      genome: { strength: 0.5, intelligence: 0.5, speech: 0.5, dexterity: 0.1 },
    });
    const b = person({
      id: 11,
      genome: { strength: 0.5, intelligence: 0.5, speech: 0.5, dexterity: 0.99 },
    });
    // Tie on governing score → lowest id wins, regardless of dexterity.
    expect(selectLeader([b, a])).toBe(10);
  });

  it("breaks ties deterministically by lowest id", () => {
    const a = person({ id: 7, genome: { strength: 0.6, intelligence: 0.6, speech: 0.6 } });
    const b = person({ id: 3, genome: { strength: 0.6, intelligence: 0.6, speech: 0.6 } });
    expect(selectLeader([a, b])).toBe(3);
    expect(selectLeader([b, a])).toBe(3);
  });
});

describe("leaderTrait & leaderBonus", () => {
  it("leads by the strongest governing trait", () => {
    expect(leaderTrait(person({ genome: { strength: 0.9, intelligence: 0.2, speech: 0.2 } }))).toBe(
      "strength",
    );
    expect(
      leaderTrait(person({ genome: { strength: 0.2, intelligence: 0.9, speech: 0.2 } })),
    ).toBe("intelligence");
    expect(leaderTrait(person({ genome: { strength: 0.2, intelligence: 0.2, speech: 0.9 } }))).toBe(
      "speech",
    );
  });

  it("a strong leader hardens defense and leaves other levers neutral", () => {
    const leader = person({ genome: { strength: 1, intelligence: 0.2, speech: 0.2 } });
    const b = leaderBonus(leader);
    expect(b.trait).toBe("strength");
    expect(b.style).toBe(LEADER_STYLE.strength);
    // defenseMult is a lethality multiplier: <1 = better defended.
    expect(b.defenseMult).toBeCloseTo(1 - LEADER_BONUS_SCALE, 10);
    expect(b.researchMult).toBe(1);
    expect(b.foodMult).toBe(1);
  });

  it("a smart leader speeds research and a speechful one boosts cooperative food", () => {
    const sage = leaderBonus(person({ genome: { strength: 0.2, intelligence: 1, speech: 0.2 } }));
    expect(sage.trait).toBe("intelligence");
    expect(sage.researchMult).toBeCloseTo(1 + LEADER_BONUS_SCALE, 10);
    expect(sage.defenseMult).toBe(1);
    expect(sage.foodMult).toBe(1);

    const speaker = leaderBonus(person({ genome: { strength: 0.2, intelligence: 0.2, speech: 1 } }));
    expect(speaker.trait).toBe("speech");
    expect(speaker.foodMult).toBeCloseTo(1 + LEADER_BONUS_SCALE, 10);
    expect(speaker.defenseMult).toBe(1);
    expect(speaker.researchMult).toBe(1);
  });

  it("scales the bonus linearly with the leader's trait value", () => {
    const half = leaderBonus(person({ genome: { strength: 0.2, intelligence: 0.5, speech: 0.2 } }));
    const full = leaderBonus(person({ genome: { strength: 0.2, intelligence: 1, speech: 0.2 } }));
    expect(half.researchMult).toBeCloseTo(1 + 0.5 * LEADER_BONUS_SCALE, 10);
    expect(full.researchMult).toBeCloseTo(1 + 1.0 * LEADER_BONUS_SCALE, 10);
  });
});

describe("Simulation leadership & succession", () => {
  it("appoints a leader once the tribe is running", () => {
    const sim = new Simulation({ seed: 7, startingPopulation: 10 });
    expect(sim.state.leaderId).toBeNull();
    sim.tick();
    expect(sim.state.leaderId).not.toBeNull();
    const leader = sim.leader();
    expect(leader).toBeDefined();
    expect(leader!.id).toBe(sim.state.leaderId);
  });

  it("keeps the same leader while they live", () => {
    const sim = new Simulation({ seed: 7, startingPopulation: 12 });
    sim.tick();
    const first = sim.state.leaderId;
    expect(first).not.toBeNull();
    // While that individual stays alive, the role does not change hands.
    for (let i = 0; i < 5; i++) {
      sim.tick();
      if (sim.living.some((p) => p.id === first)) {
        expect(sim.state.leaderId).toBe(first);
      }
    }
  });

  it("holds a succession when the leader dies, always pointing at a living member", () => {
    const sim = new Simulation({ seed: 3, startingPopulation: 12 });
    sim.tick();
    const first = sim.state.leaderId!;
    let succeeded = false;
    let loggedSuccession = false;
    // Run until the founding leader has died and the role has passed on. Each tick
    // the standing leader must be a living individual (never a corpse).
    for (let i = 0; i < 200 && !succeeded; i++) {
      sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
      sim.tick();
      if (sim.state.leaderId !== null) {
        expect(sim.living.some((p) => p.id === sim.state.leaderId)).toBe(true);
      }
      // Capture the succession log this tick (the log buffer is capped, so check live).
      if (sim.state.log.some((e) => e.message.includes("succeeds to lead"))) loggedSuccession = true;
      if (sim.state.leaderId !== first) succeeded = true;
    }
    expect(succeeded).toBe(true);
    // The succession is recorded in the chronicle.
    expect(loggedSuccession).toBe(true);
  });

  it("is deterministic: same seed → same leader lineage over time", () => {
    const run = () => {
      const sim = new Simulation({ seed: 21, startingPopulation: 12 });
      const ids: (number | null)[] = [];
      for (let i = 0; i < 40; i++) {
        sim.tick();
        ids.push(sim.state.leaderId);
      }
      return ids;
    };
    expect(run()).toEqual(run());
  });
});
