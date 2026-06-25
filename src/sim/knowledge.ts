import {
  ERAS,
  TECHS,
  type Era,
  type TechDef,
  type TechEffects,
  type TechId,
} from "./types.js";

/**
 * The full tech tree spanning Paleolithic → Modern. Culture is cumulative and
 * lives in {@link Knowledge}, fully separate from individuals — when every
 * person who discovered fire is dead, the tribe still *has* fire.
 *
 * Each tech's gameplay impact is pure data in `effects` (see TechEffects); the
 * simulation aggregates them generically. Five `unlocksEra` capstones advance
 * the world era; reaching the Modern era wins the game.
 */
export const TECH_TREE: Record<TechId, TechDef> = {
  // ── Paleolithic ────────────────────────────────────────────────────────────
  stoneTools: {
    id: "stoneTools", name: "Stone Tools", era: "Paleolithic", category: "craft",
    prereqs: [], cost: 45,
    effects: { gatherMult: 1.15, huntMult: 1.15, buildMult: 1.2 },
    blurb: "Knapped flint — makes every other task more productive.",
  },
  gestures: {
    id: "gestures", name: "Gestures", era: "Paleolithic", category: "language",
    prereqs: [], cost: 40,
    effects: { researchMult: 1.15 },
    blurb: "The first shared signs. Cooperation begins.",
  },
  fire: {
    id: "fire", name: "Fire", era: "Paleolithic", category: "survival",
    prereqs: ["stoneTools"], cost: 65,
    effects: { warmth: 0.3 },
    blurb: "Warmth against the cold and a hearth to gather around.",
  },
  gathering: {
    id: "gathering", name: "Wild-Plant Gathering", era: "Paleolithic", category: "food",
    prereqs: ["stoneTools"], cost: 70,
    effects: { gatherMult: 1.5 },
    blurb: "Know which seeds and roots feed you — the road to farming.",
  },
  hunting: {
    id: "hunting", name: "Coordinated Hunting", era: "Paleolithic", category: "food",
    prereqs: ["stoneTools"], cost: 80,
    effects: { huntMult: 1.5, defenseMult: 0.8 },
    blurb: "Bring down big game together. Meat scales with strength.",
  },
  cooking: {
    id: "cooking", name: "Cooking", era: "Paleolithic", category: "food",
    prereqs: ["fire"], cost: 85,
    effects: { foodMult: 1.2, intelPressure: 2.0 },
    blurb: "Cooked food unlocks calories — and rewards bigger brains.",
  },
  burial: {
    id: "burial", name: "Burial & Ritual", era: "Paleolithic", category: "culture",
    prereqs: ["gestures"], cost: 70,
    effects: { birthMult: 1.08 },
    blurb: "To mourn the dead is to bind the living together.",
  },
  caveArt: {
    id: "caveArt", name: "Cave Art", era: "Paleolithic", category: "culture",
    prereqs: ["gestures"], cost: 80,
    effects: { researchMult: 1.1 },
    blurb: "Stories on stone. Knowledge outlasts the teller.",
  },
  symbols: {
    id: "symbols", name: "Symbols", era: "Paleolithic", category: "language",
    prereqs: ["gestures", "caveArt"], cost: 110,
    effects: { researchMult: 1.2 },
    blurb: "Marks that mean things — the seed of writing.",
  },

  // ── Neolithic ──────────────────────────────────────────────────────────────
  agriculture: {
    id: "agriculture", name: "Agriculture", era: "Neolithic", category: "food",
    prereqs: ["gathering", "cooking"], cost: 150, unlocksEra: "Neolithic",
    effects: { foodMult: 1.4, capacityBonus: 6 },
    blurb: "Plant the seeds you once gathered. The Neolithic begins.",
  },
  pottery: {
    id: "pottery", name: "Pottery", era: "Neolithic", category: "craft",
    prereqs: ["agriculture"], cost: 130,
    effects: { foodMult: 1.12, capacityBonus: 3 },
    blurb: "Fired clay stores the harvest through the lean months.",
  },
  animalDomestication: {
    id: "animalDomestication", name: "Animal Domestication", era: "Neolithic", category: "food",
    prereqs: ["hunting", "agriculture"], cost: 140,
    effects: { huntMult: 1.3, defenseMult: 0.8, foodMult: 1.1 },
    blurb: "Wolves become dogs; aurochs become herds. Loyal muscle and meat.",
  },
  weaving: {
    id: "weaving", name: "Weaving", era: "Neolithic", category: "craft",
    prereqs: ["agriculture"], cost: 125, resourceCost: { hide: 12 },
    effects: { warmth: 0.22 },
    blurb: "Spun fiber and woven cloth — warmth you can carry.",
  },
  calendar: {
    id: "calendar", name: "Calendar", era: "Neolithic", category: "science",
    prereqs: ["symbols", "agriculture"], cost: 150,
    effects: { foodMult: 1.15, researchMult: 1.1 },
    blurb: "Read the sky, time the planting. Order from the seasons.",
  },
  spokenLanguage: {
    id: "spokenLanguage", name: "Spoken Language", era: "Neolithic", category: "language",
    prereqs: ["symbols"], cost: 160,
    effects: { researchMult: 1.3, intelPressure: 0.6 },
    blurb: "Full speech. Ideas leap between minds.",
  },

  // ── Bronze Age ─────────────────────────────────────────────────────────────
  bronzeworking: {
    id: "bronzeworking", name: "Bronze Working", era: "Bronze Age", category: "craft",
    prereqs: ["pottery", "animalDomestication"], cost: 220, unlocksEra: "Bronze Age",
    resourceCost: { stone: 16 },
    effects: { buildMult: 1.3, defenseMult: 0.8, huntMult: 1.15 },
    blurb: "Copper and tin, smelted and cast. The first metal age.",
  },
  theWheel: {
    id: "theWheel", name: "The Wheel", era: "Bronze Age", category: "craft",
    prereqs: ["bronzeworking"], cost: 180, resourceCost: { wood: 14 },
    effects: { gatherMult: 1.2, capacityBonus: 4, buildMult: 1.1 },
    blurb: "Cart and potter's wheel — load and labor, multiplied.",
  },
  writing: {
    id: "writing", name: "Writing", era: "Bronze Age", category: "language",
    prereqs: ["spokenLanguage", "bronzeworking"], cost: 230,
    effects: { researchMult: 1.5 },
    blurb: "Knowledge written down never dies. Research compounds.",
  },
  irrigation: {
    id: "irrigation", name: "Irrigation", era: "Bronze Age", category: "food",
    prereqs: ["agriculture", "theWheel"], cost: 200,
    effects: { foodMult: 1.3, abundance: 0.15 },
    blurb: "Channel the rivers; the desert blooms.",
  },
  sailing: {
    id: "sailing", name: "Sailing", era: "Bronze Age", category: "science",
    prereqs: ["theWheel"], cost: 210,
    effects: { abundance: 0.2, capacityBonus: 4 },
    blurb: "Cross the water to new shores and new trade.",
  },

  // ── Iron Age ───────────────────────────────────────────────────────────────
  ironworking: {
    id: "ironworking", name: "Iron Working", era: "Iron Age", category: "craft",
    prereqs: ["bronzeworking", "writing"], cost: 300, unlocksEra: "Iron Age",
    resourceCost: { stone: 22 },
    effects: { buildMult: 1.3, defenseMult: 0.7, huntMult: 1.15 },
    blurb: "Iron is everywhere and unforgiving. Tools and plows of steel.",
  },
  masonry: {
    id: "masonry", name: "Masonry", era: "Iron Age", category: "craft",
    prereqs: ["ironworking"], cost: 280,
    effects: { capacityBonus: 10, warmth: 0.2, defenseMult: 0.85 },
    blurb: "Cut stone, raised walls — towns become permanent.",
  },
  currency: {
    id: "currency", name: "Currency", era: "Iron Age", category: "science",
    prereqs: ["writing"], cost: 260,
    effects: { researchMult: 1.2, foodMult: 1.1 },
    blurb: "Coin frees trade from barter. Specialists can specialize.",
  },
  mathematics: {
    id: "mathematics", name: "Mathematics", era: "Iron Age", category: "science",
    prereqs: ["writing"], cost: 300,
    effects: { researchMult: 1.4, buildMult: 1.1 },
    blurb: "Number and proof — the language the universe answers to.",
  },
  medicine: {
    id: "medicine", name: "Medicine", era: "Iron Age", category: "science",
    prereqs: ["writing", "mathematics"], cost: 320,
    effects: { diseaseDefense: 0.45 },
    blurb: "Herbs, surgery, and the first true physicians.",
  },

  // ── Classical ──────────────────────────────────────────────────────────────
  philosophy: {
    id: "philosophy", name: "Philosophy", era: "Classical", category: "science",
    prereqs: ["mathematics"], cost: 330,
    effects: { researchMult: 1.3, intelPressure: 0.4 },
    blurb: "Reasoned inquiry into nature and mind — the examined life.",
  },
  engineering: {
    id: "engineering", name: "Engineering", era: "Classical", category: "craft",
    prereqs: ["ironworking", "mathematics"], cost: 400, unlocksEra: "Classical",
    effects: { buildMult: 1.35, capacityBonus: 8, defenseMult: 0.85 },
    blurb: "Roads, arches and aqueducts. Antiquity raises its monuments.",
  },
  republic: {
    id: "republic", name: "Republic", era: "Classical", category: "culture",
    prereqs: ["currency", "philosophy"], cost: 360,
    effects: { researchMult: 1.2, birthMult: 1.05, capacityBonus: 6 },
    blurb: "Law and assembly — power shared, the city ordered.",
  },
  aqueduct: {
    id: "aqueduct", name: "Aqueducts", era: "Classical", category: "science",
    prereqs: ["engineering", "medicine"], cost: 380,
    effects: { diseaseDefense: 0.4, foodMult: 1.12, capacityBonus: 6 },
    blurb: "Clean water carried for miles — cities can finally grow.",
  },

  // ── Medieval ───────────────────────────────────────────────────────────────
  university: {
    id: "university", name: "Universities", era: "Medieval", category: "language",
    prereqs: ["philosophy", "writing"], cost: 440,
    effects: { researchMult: 1.5 },
    blurb: "Halls of scholars preserve and multiply learning.",
  },
  windmill: {
    id: "windmill", name: "Windmills", era: "Medieval", category: "craft",
    prereqs: ["engineering", "theWheel"], cost: 410,
    effects: { foodMult: 1.3, buildMult: 1.1 },
    blurb: "Harness wind and water to grind grain and saw timber.",
  },
  guilds: {
    id: "guilds", name: "Guilds", era: "Medieval", category: "craft",
    prereqs: ["university", "windmill"], cost: 520, unlocksEra: "Medieval",
    effects: { researchMult: 1.2, buildMult: 1.25, capacityBonus: 8 },
    blurb: "Master craftsmen organise. Towns swell into cities.",
  },
  gunpowder: {
    id: "gunpowder", name: "Gunpowder", era: "Medieval", category: "craft",
    prereqs: ["guilds", "ironworking"], cost: 460,
    effects: { defenseMult: 0.65 },
    blurb: "Black powder ends the age of walls and knights.",
  },
  banking: {
    id: "banking", name: "Banking", era: "Medieval", category: "science",
    prereqs: ["guilds", "republic"], cost: 440,
    effects: { researchMult: 1.25, capacityBonus: 8, foodMult: 1.1 },
    blurb: "Credit and ledgers — capital pools to fund great works.",
  },

  // ── Industrial ─────────────────────────────────────────────────────────────
  steamPower: {
    id: "steamPower", name: "Steam Power", era: "Industrial", category: "science",
    prereqs: ["guilds", "gunpowder", "banking"], cost: 720, unlocksEra: "Industrial",
    effects: { researchMult: 1.5, buildMult: 1.5, foodMult: 1.2 },
    blurb: "Boil water, move the world. The machine age dawns.",
  },
  printing: {
    id: "printing", name: "Printing Press", era: "Industrial", category: "language",
    prereqs: ["writing", "mathematics"], cost: 360,
    effects: { researchMult: 1.5 },
    blurb: "Ideas mass-produced. Literacy and progress explode.",
  },
  machinery: {
    id: "machinery", name: "Machinery", era: "Industrial", category: "craft",
    prereqs: ["steamPower"], cost: 400,
    effects: { foodMult: 1.3, capacityBonus: 9, buildMult: 1.3 },
    blurb: "Engines and factories — abundance at unprecedented scale.",
  },
  sanitation: {
    id: "sanitation", name: "Sanitation", era: "Industrial", category: "science",
    prereqs: ["medicine", "masonry"], cost: 380,
    effects: { diseaseDefense: 0.6, capacityBonus: 8 },
    blurb: "Clean water and sewers — cities stop being death traps.",
  },

  // ── Modern ─────────────────────────────────────────────────────────────────
  electricity: {
    id: "electricity", name: "Electricity", era: "Modern", category: "science",
    prereqs: ["steamPower", "printing", "machinery"], cost: 820, unlocksEra: "Modern",
    effects: { researchMult: 1.8, foodMult: 1.3, capacityBonus: 11 },
    blurb: "Light and power on tap. The modern world switches on.",
  },
  telegraph: {
    id: "telegraph", name: "Telegraph & Radio", era: "Modern", category: "language",
    prereqs: ["electricity"], cost: 560,
    effects: { researchMult: 1.6 },
    blurb: "Messages outrun horses — the world starts to feel small.",
  },
  automobile: {
    id: "automobile", name: "Automobile", era: "Modern", category: "craft",
    prereqs: ["electricity", "machinery"], cost: 620,
    effects: { foodMult: 1.2, capacityBonus: 10, abundance: 0.12 },
    blurb: "Engines on every road. Distance collapses.",
  },

  // ── Information (win) ─────────────────────────────────────────────────────────
  electronics: {
    id: "electronics", name: "Electronics", era: "Information", category: "science",
    prereqs: ["telegraph"], cost: 900,
    effects: { researchMult: 1.8 },
    blurb: "The transistor. Switches too small to see, too many to count.",
  },
  vaccines: {
    id: "vaccines", name: "Vaccines", era: "Information", category: "science",
    prereqs: ["sanitation", "electricity"], cost: 660,
    effects: { diseaseDefense: 0.85, capacityBonus: 14 },
    blurb: "Disease, once fate, becomes a choice. Lifespans soar.",
  },
  computing: {
    id: "computing", name: "Computing", era: "Information", category: "science",
    prereqs: ["electronics", "automobile"], cost: 1200, unlocksEra: "Information",
    effects: { researchMult: 2.2, capacityBonus: 14, foodMult: 1.3 },
    blurb: "Thinking machines. The Information Age — your people remake the world.",
  },
  internet: {
    id: "internet", name: "The Internet", era: "Information", category: "language",
    prereqs: ["computing"], cost: 800,
    effects: { researchMult: 2.5 },
    blurb: "Every mind, connected. Knowledge becomes instant and total.",
  },
};

export const TECH_ORDER: TechId[] = [...TECHS];

/** Which discovered tech advances to each era (for goals/UI). */
export function eraCapstone(era: Era): TechId | null {
  for (const id of TECH_ORDER) if (TECH_TREE[id].unlocksEra === era) return id;
  return null;
}

const LANGUAGE_CHAIN: TechId[] = ["gestures", "symbols", "spokenLanguage", "writing", "printing"];

/** Cumulative cultural memory. Persists across births and deaths. */
export class Knowledge {
  readonly discovered = new Set<TechId>();
  readonly progress: Record<TechId, number> = Object.fromEntries(
    TECH_ORDER.map((t) => [t, 0]),
  ) as Record<TechId, number>;

  has(t: TechId): boolean {
    return this.discovered.has(t);
  }

  isUnlocked(t: TechId): boolean {
    if (this.has(t)) return false;
    return TECH_TREE[t].prereqs.every((p) => this.has(p));
  }

  available(): TechId[] {
    return TECH_ORDER.filter((t) => this.isUnlocked(t));
  }

  /** How far up the grunts→writing chain the culture has climbed (0..5). */
  languageLevel(): number {
    let n = 0;
    for (const t of LANGUAGE_CHAIN) if (this.has(t)) n++;
    return n;
  }

  /**
   * Add research points to a target. Returns the TechId if this push completed
   * (newly discovered) the tech, else null. When `ready` is false the tech can
   * fill up to its cost but cannot complete — it parks there until the gating
   * condition (e.g. its raw-resource bill, checked by the caller) is met.
   */
  addProgress(target: TechId, points: number, ready = true): TechId | null {
    if (!this.isUnlocked(target)) return null;
    this.progress[target] += points;
    if (this.progress[target] >= TECH_TREE[target].cost) {
      if (!ready) {
        this.progress[target] = TECH_TREE[target].cost;
        return null;
      }
      this.discovered.add(target);
      return target;
    }
    return null;
  }

  /** Aggregate every discovered tech's effects into one resolved bundle. */
  aggregateEffects(): Required<TechEffects> {
    const e: Required<TechEffects> = {
      gatherMult: 1, huntMult: 1, foodMult: 1, buildMult: 1, researchMult: 1, birthMult: 1,
      defenseMult: 1, diseaseDefense: 0, warmth: 0, capacityBonus: 0, intelPressure: 0, abundance: 0,
    };
    for (const id of this.discovered) {
      const fx = TECH_TREE[id].effects;
      if (fx.gatherMult) e.gatherMult *= fx.gatherMult;
      if (fx.huntMult) e.huntMult *= fx.huntMult;
      if (fx.foodMult) e.foodMult *= fx.foodMult;
      if (fx.buildMult) e.buildMult *= fx.buildMult;
      if (fx.researchMult) e.researchMult *= fx.researchMult;
      if (fx.birthMult) e.birthMult *= fx.birthMult;
      if (fx.defenseMult) e.defenseMult *= fx.defenseMult;
      if (fx.diseaseDefense) e.diseaseDefense = 1 - (1 - e.diseaseDefense) * (1 - fx.diseaseDefense);
      if (fx.warmth) e.warmth += fx.warmth;
      if (fx.capacityBonus) e.capacityBonus += fx.capacityBonus;
      if (fx.intelPressure) e.intelPressure += fx.intelPressure;
      if (fx.abundance) e.abundance += fx.abundance;
    }
    return e;
  }

  /** The highest era whose capstone is discovered (defaults to Paleolithic). */
  currentEra(): Era {
    let era: Era = ERAS[0];
    for (const id of this.discovered) {
      const u = TECH_TREE[id].unlocksEra;
      if (u && ERAS.indexOf(u) > ERAS.indexOf(era)) era = u;
    }
    return era;
  }

  serialize(): { discovered: TechId[]; progress: Record<string, number> } {
    return { discovered: [...this.discovered], progress: { ...this.progress } };
  }

  static deserialize(data: { discovered: TechId[]; progress: Record<string, number> }): Knowledge {
    const k = new Knowledge();
    for (const t of data.discovered) k.discovered.add(t);
    for (const t of TECH_ORDER) k.progress[t] = data.progress[t] ?? 0;
    return k;
  }
}
