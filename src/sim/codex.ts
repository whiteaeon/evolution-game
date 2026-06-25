/**
 * The lore codex — a small, pure-data encyclopedia layered over the simulation.
 *
 * Every tech, biome, lineage and choice-driven event has one short {@link CodexEntry}
 * of flavour text. Tech and biome lore reuse the canonical `blurb` already on each
 * definition (single source of truth — no duplicated prose), while lineages and
 * events carry their own codex lore here.
 *
 * Discovery is *derived*, never stored: an entry is unlocked once its subject has
 * been encountered, read from existing sim state via {@link CodexContext}. The codex
 * never reaches back into the sim or the renderer — like {@link QuestDef}, it is a
 * read-only data layer the UI consumes.
 */

import { TECH_TREE, TECH_ORDER } from "./knowledge.js";
import { BIOME_PROFILE } from "./regions.js";
import {
  BIOMES,
  EVENT_CHAINS,
  LINEAGES,
  type Biome,
  type EventChainId,
  type Lineage,
  type TechId,
} from "./types.js";

export type CodexCategory = "tech" | "biome" | "lineage" | "event";

/** One encyclopedia entry: a subject, the category it belongs to, and its lore. */
export interface CodexEntry {
  category: CodexCategory;
  /** The subject's id within its category (a TechId, Biome, Lineage or EventChainId). */
  id: string;
  title: string;
  lore: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Lore for each hominin lineage you can meet and interbreed with. */
const LINEAGE_LORE: Record<Lineage, { title: string; lore: string }> = {
  sapiens: {
    title: "Early Sapiens",
    lore: "Clever and silver-tongued wanderers. Their blood sharpens wit and speech.",
  },
  neanderthal: {
    title: "Neanderthals",
    lore: "Stocky hunters of the cold country. Their blood lends raw strength and a body built for winter.",
  },
  denisovan: {
    title: "Denisovans",
    lore: "Highland cousins from the far east. Their blood carries hardy resistance to cold and disease.",
  },
};

/** Lore for each choice-driven event chain the tribe can live through. */
const EVENT_LORE: Record<EventChainId, { title: string; lore: string }> = {
  hardWinter: {
    title: "A Hard Winter",
    lore: "When the cold bites deepest and the stores run thin, the tribe must choose between caution and a desperate hunt.",
  },
  sickCamp: {
    title: "Sickness in the Camp",
    lore: "A fever moves from hearth to hearth. To tend the afflicted costs dearly; to let it run costs lives.",
  },
  rivalCache: {
    title: "A Rival's Granary",
    lore: "A neighbouring camp's hoard, found by scouts. Bargain for a share, or take it by force.",
  },
  prophet: {
    title: "A Seer's Vision",
    lore: "A wandering seer reads signs in the sky. Offerings calm the camp; the vision itself can enlighten — or kill.",
  },
  migrationOmen: {
    title: "A Great Migration",
    lore: "The herds move and the omens point away. Stay and endure a lean season, or follow into the cold.",
  },
  feud: {
    title: "A Blood Feud",
    lore: "Two families turn on each other. A feast may reconcile them, or they settle it in blood.",
  },
  bountifulFlood: {
    title: "A Bountiful Flood",
    lore: "The river drowns the plain in fertile silt. Flee to high ground, or harvest the danger.",
  },
  stranger: {
    title: "A Stranger Bearing Knowledge",
    lore: "A lone traveller offers what they know. Wisdom is worth a meal — but strangers carry more than ideas.",
  },
  sacredSite: {
    title: "A Sacred Site",
    lore: "Scouts find ground that hums with old power. Honour it from afar, or claim what it guards.",
  },
};

/**
 * The full codex, in discovery order: every tech, biome, lineage and event.
 * Tech and biome lore are the canonical blurbs, so each subject is guaranteed
 * exactly one entry.
 */
export const CODEX_ENTRIES: CodexEntry[] = [
  ...TECH_ORDER.map(
    (id): CodexEntry => ({ category: "tech", id, title: TECH_TREE[id].name, lore: TECH_TREE[id].blurb }),
  ),
  ...BIOMES.map(
    (b): CodexEntry => ({ category: "biome", id: b, title: cap(b), lore: BIOME_PROFILE[b].blurb }),
  ),
  ...LINEAGES.map(
    (l): CodexEntry => ({ category: "lineage", id: l, title: LINEAGE_LORE[l].title, lore: LINEAGE_LORE[l].lore }),
  ),
  ...EVENT_CHAINS.map(
    (e): CodexEntry => ({ category: "event", id: e, title: EVENT_LORE[e].title, lore: EVENT_LORE[e].lore }),
  ),
];

/** Everything an entry's unlock can be derived from, read-only. */
export interface CodexContext {
  /** Techs the tribe has discovered. */
  discoveredTechs: ReadonlySet<TechId>;
  /** Biomes the tribe has ever lived in. */
  visitedBiomes: readonly Biome[];
  /** Hominin lineages the tribe has interbred with. */
  interbredLineages: readonly Lineage[];
  /** Choice-driven event chains the tribe has encountered. */
  seenEventChains: readonly EventChainId[];
}

/** Whether a codex entry has been discovered, derived purely from the context. */
export function isUnlocked(entry: CodexEntry, ctx: CodexContext): boolean {
  switch (entry.category) {
    case "tech":
      return ctx.discoveredTechs.has(entry.id as TechId);
    case "biome":
      return ctx.visitedBiomes.includes(entry.id as Biome);
    case "lineage":
      return ctx.interbredLineages.includes(entry.id as Lineage);
    case "event":
      return ctx.seenEventChains.includes(entry.id as EventChainId);
  }
}
