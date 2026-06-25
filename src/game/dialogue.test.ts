import { describe, it, expect, vi } from "vitest";
import { buildDialogue, type DialogueData, type QuestView } from "./dialogue.js";
import { pickDialogueLine, type Genome, type Individual } from "../sim/index.js";

function indiv(genome: Partial<Genome> = {}): Individual {
  const g: Genome = {
    strength: 0.1,
    intelligence: 0.1,
    dexterity: 0.1,
    coldTolerance: 0.1,
    diseaseResistance: 0.1,
    speech: 0.1,
    ...genome,
  };
  return {
    id: 7,
    genome: g,
    sex: "f",
    age: 24,
    generation: 0,
    food: 1,
    warmth: 1,
    health: 1,
    alive: true,
    ateCooked: false,
  };
}

function base(over: Partial<DialogueData> = {}): DialogueData {
  return {
    ind: indiv(),
    era: "Neolithic",
    seed: 7,
    onAccept: vi.fn(),
    onTurnIn: vi.fn(),
    ...over,
  };
}

const quest = (state: QuestView["state"], over: Partial<QuestView> = {}): QuestView => ({
  desc: "Gather 5 wood",
  state,
  reward: { res: "food", amount: 12 },
  progress: 0,
  target: 5,
  ...over,
});

describe("buildDialogue — flavor branches", () => {
  it("offers two reply choices at the root, no quest", () => {
    const root = buildDialogue(base());
    expect(root.choices).toHaveLength(2);
    expect(root.body).toContain("chieftain");
  });

  it("backstory branch speaks the dominant trait, and loops back to root", () => {
    const root = buildDialogue(base({ ind: indiv({ dexterity: 0.9 }) }));
    const back = root.choices[0].next();
    expect(back).not.toBeNull();
    expect(back!.body).toContain("flint"); // dexterity line
    expect(back!.body).toContain("Neolithic");
    // "Ask something else" returns to a fresh root with two choices again.
    const again = back!.choices[0].next();
    expect(again!.choices).toHaveLength(2);
    // "Farewell" ends the conversation.
    expect(back!.choices[1].next()).toBeNull();
  });

  it("lore branch reuses the sim's eraChange dialogue table", () => {
    const root = buildDialogue(base({ seed: 42 }));
    const lore = root.choices[1].next();
    expect(lore!.body).toBe(pickDialogueLine("eraChange", 42));
  });

  it("notable villagers introduce themselves by title and detail", () => {
    const root = buildDialogue(base({ notable: { title: "the Long-lived", detail: "61 years" } }));
    const back = root.choices[0].next();
    expect(back!.body).toContain("the Long-lived");
    expect(back!.body).toContain("61 years");
  });
});

describe("buildDialogue — quest branches", () => {
  it("available quest offers accept/decline; accept runs the effect", () => {
    const onAccept = vi.fn();
    const root = buildDialogue(base({ quest: quest("available"), onAccept }));
    expect(root.choices).toHaveLength(2);
    expect(root.body).toContain("Gather 5 wood");
    const after = root.choices[0].next();
    expect(onAccept).toHaveBeenCalledOnce();
    expect(after).not.toBeNull();
    expect(after!.choices[0].next()).toBeNull(); // confirmation ends in Farewell
  });

  it("declining an available quest does not run the effect", () => {
    const onAccept = vi.fn();
    const root = buildDialogue(base({ quest: quest("available"), onAccept }));
    const after = root.choices[1].next();
    expect(onAccept).not.toHaveBeenCalled();
    expect(after).not.toBeNull();
  });

  it("ready quest collects the reward via the turn-in effect", () => {
    const onTurnIn = vi.fn();
    const root = buildDialogue(base({ quest: quest("ready"), onTurnIn }));
    expect(root.choices[0].label).toContain("12 food");
    const after = root.choices[0].next();
    expect(onTurnIn).toHaveBeenCalledOnce();
    expect(after!.body).toContain("thanks");
    expect(root.choices[1].next()).toBeNull(); // "Hold onto it" just closes
  });

  it("active quest shows progress and a single close choice", () => {
    const root = buildDialogue(base({ quest: quest("active", { progress: 2, target: 5 }) }));
    expect(root.body).toContain("2/5");
    expect(root.choices).toHaveLength(1);
    expect(root.choices[0].next()).toBeNull();
  });

  it("a done quest falls through to flavor dialogue", () => {
    const root = buildDialogue(base({ quest: quest("done") }));
    expect(root.choices).toHaveLength(2);
    expect(root.body).toContain("chieftain");
  });
});
