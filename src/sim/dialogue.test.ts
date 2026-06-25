import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation.js";
import { DIALOGUE, pickDialogueLine, type DialogueSituation } from "./dialogue.js";

const SITUATIONS = Object.keys(DIALOGUE) as DialogueSituation[];

/**
 * Run the headless autopilot a while, collecting every flavor line as it is
 * emitted (the log is capped at 60 entries, so a long run drops old ones).
 */
function playDialogue(seed: number, ticks = 400): string[] {
  const sim = new Simulation({ seed, startingPopulation: 12 });
  const lines: string[] = [];
  for (let i = 0; i < ticks && sim.living.length > 0 && !sim.state.won; i++) {
    sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
    if (sim.state.pendingEncounter) sim.resolveEncounter(true);
    if (sim.state.pendingChoice) sim.resolveChoice(0);
    sim.tick();
    for (const e of sim.state.log) {
      if (e.type === "dialogue" && e.tick === sim.state.tick) lines.push(e.message);
    }
  }
  return lines;
}

describe("the dialogue content table", () => {
  it("is well-formed: every situation has lines and every line is non-empty", () => {
    expect(SITUATIONS.length).toBeGreaterThan(0);
    for (const situation of SITUATIONS) {
      const lines = DIALOGUE[situation];
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(typeof line).toBe("string");
        expect(line.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("covers exactly the documented situations", () => {
    expect(SITUATIONS.sort()).toEqual(
      ["birth", "death", "encounter", "eraChange", "eventChain"].sort(),
    );
  });
});

describe("pickDialogueLine", () => {
  it("always returns a line from the situation's own table", () => {
    for (const situation of SITUATIONS) {
      for (let seed = 0; seed < 50; seed++) {
        expect(DIALOGUE[situation]).toContain(pickDialogueLine(situation, seed));
      }
    }
  });

  it("is deterministic for a given situation and seed", () => {
    for (const situation of SITUATIONS) {
      expect(pickDialogueLine(situation, 1234)).toBe(pickDialogueLine(situation, 1234));
    }
  });

  it("varies across seeds (not a constant)", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 40; seed++) seen.add(pickDialogueLine("encounter", seed));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("the simulation gives the tribe a voice", () => {
  it("emits flavor dialogue during a normal run, drawn only from the table", () => {
    const dialogue = playDialogue(42);
    expect(dialogue.length).toBeGreaterThan(0);
    const all = SITUATIONS.flatMap((s) => DIALOGUE[s]);
    for (const message of dialogue) {
      expect(message.length).toBeGreaterThan(0);
      expect(all.some((line) => message.includes(line))).toBe(true);
    }
  });

  it("is deterministic: the same seed speaks the same words", () => {
    const a = playDialogue(7);
    const b = playDialogue(7);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
});
