/**
 * Pure, Phaser-free builder for WorldScene's branching villager conversations.
 *
 * WorldScene owns the panel, the choice text objects and the click handling; this
 * module only knows how to assemble the conversation *tree* — a {@link DialogNode}
 * with a body line and a couple of {@link DialogChoice}s, each of which runs an
 * effect and returns the next node (or null to end). Keeping the tree here lets it
 * be unit-tested without a canvas, the same way {@link "./quests"} splits the
 * progress maths out of the scene.
 *
 * Content reuses the sim's existing voice: notable titles/details from
 * {@link notableById}, the era, the genome traits, and the sim's flavor
 * {@link pickDialogueLine} table for "tell me of these times".
 */
import { pickDialogueLine, type Genome, type Individual, type TraitName } from "../sim/index.js";
import type { ResKind } from "./quests.js";

/** One selectable reply: a label, and the effect+navigation it triggers. */
export interface DialogChoice {
  label: string;
  /** Apply the choice's effect and return the next node, or null to end. */
  next: () => DialogNode | null;
}

/** A single beat of conversation: a line plus the replies the player can pick. */
export interface DialogNode {
  body: string;
  choices: DialogChoice[];
}

/** The quest facts the dialogue needs, decoupled from WorldScene's Quest type. */
export interface QuestView {
  desc: string;
  state: "available" | "active" | "ready" | "done";
  reward: { res: ResKind; amount: number };
  progress: number;
  target: number;
}

/** Everything {@link buildDialogue} needs, with effects injected by the scene. */
export interface DialogueData {
  ind: Individual;
  era: string;
  notable?: { title: string; detail: string };
  /** The villager's open quest, if any (omit when state is "done"). */
  quest?: QuestView;
  /** Seed for the deterministic lore line (use the giver id so it's stable). */
  seed: number;
  /** Accept an available quest (set it active, flash, etc.). */
  onAccept: () => void;
  /** Turn in a ready quest (grant the reward). */
  onTurnIn: () => void;
}

/** In-character backstory line per dominant trait (mirrors the sim's voice). */
const TRAIT_LINE: Record<TraitName, string> = {
  strength: "These hands haul and hunt for the band.",
  intelligence: "I watch the sky and remember what the old ones taught.",
  dexterity: "Give me flint and I'll knap you a fine edge.",
  coldTolerance: "The frost doesn't bite me the way it bites the young.",
  diseaseResistance: "Fever came through camp, and still I stand.",
  speech: "Sit — let me tell you how we came to this place.",
};

function topTrait(g: Genome): TraitName {
  return (Object.keys(g) as TraitName[]).reduce((a, b) => (g[b] > g[a] ? b : a));
}

const farewell = (): DialogChoice => ({ label: "Farewell", next: () => null });

/** Build the root conversation node for a villager. */
export function buildDialogue(d: DialogueData): DialogNode {
  if (d.quest && d.quest.state !== "done") return questNode(d, d.quest);
  return flavorRoot(d);
}

/** Quest givers branch on quest state: offer → accept/decline, or turn-in. */
function questNode(d: DialogueData, q: QuestView): DialogNode {
  if (q.state === "available") {
    return {
      body: `I could use a hand, chieftain: ${q.desc}. Do this and ${q.reward.amount} ${q.reward.res} are yours.`,
      choices: [
        {
          label: "Gladly — I'll do it",
          next: () => {
            d.onAccept();
            return { body: `Good. Come back when it's done: ${q.desc}.`, choices: [farewell()] };
          },
        },
        {
          label: "Not now",
          next: () => ({
            body: "As you will. The work will keep until you're ready.",
            choices: [farewell()],
          }),
        },
      ],
    };
  }
  if (q.state === "ready") {
    return {
      body: `You've done it — ${q.desc}? Let me see.`,
      choices: [
        {
          label: `Collect your reward (+${q.reward.amount} ${q.reward.res})`,
          next: () => {
            d.onTurnIn();
            return {
              body: `Well earned. Take these ${q.reward.amount} ${q.reward.res} with my thanks.`,
              choices: [farewell()],
            };
          },
        },
        { label: "Hold onto it for now", next: () => null },
      ],
    };
  }
  return {
    body: `${q.desc} — ${Math.min(q.progress, q.target)}/${q.target}. Come back when it's done.`,
    choices: [{ label: "I'll keep at it", next: () => null }],
  };
}

/** Villagers with no quest offer two lore branches that loop back to the root. */
function flavorRoot(d: DialogueData): DialogNode {
  const root = (): DialogNode => ({
    body: d.notable ? "Chieftain. What would you know?" : "Well met, chieftain. What would you know?",
    choices: [
      {
        label: d.notable ? "Who are you, truly?" : "How do you fare?",
        next: () => ({ body: backstory(d), choices: [askMore(root), farewell()] }),
      },
      {
        label: "Tell me of these times",
        next: () => ({ body: pickDialogueLine("eraChange", d.seed), choices: [askMore(root), farewell()] }),
      },
    ],
  });
  return root();
}

function askMore(root: () => DialogNode): DialogChoice {
  return { label: "Ask something else", next: () => root() };
}

function backstory(d: DialogueData): string {
  if (d.notable) {
    return `They call me ${d.notable.title} — ${d.notable.detail}. The tribe endures, and so do I.`;
  }
  return `${TRAIT_LINE[topTrait(d.ind.genome)]}  (${d.era}, age ${d.ind.age})`;
}
