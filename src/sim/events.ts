import { clamp01 } from "./genome.js";
import { BALANCE, cap, eraIndex } from "./balance.js";
import { TECH_TREE } from "./knowledge.js";
import { shiftRelations, type RivalTribe } from "./rivals.js";
import {
  DIPLOMACY_EVENTS,
  LINEAGES,
  TRAITS,
  type ChoiceOption,
  type DiplomacyId,
  type EventChainId,
  type Genome,
  type Individual,
  type Lineage,
  type TechEffects,
  type TraitName,
} from "./types.js";
import type { SimEngine } from "./engine.js";
import type { SimState } from "./simulation.js";

/** Trait leanings each neighbouring group contributes when you interbreed. */
const ARCHETYPE: Record<Lineage, Partial<Genome>> = {
  sapiens: { intelligence: 0.22, speech: 0.22, dexterity: 0.08 },
  neanderthal: { strength: 0.24, coldTolerance: 0.2 },
  denisovan: { diseaseResistance: 0.24, coldTolerance: 0.16 },
};
const LINEAGE_NAME: Record<Lineage, string> = {
  sapiens: "a band of early Sapiens",
  neanderthal: "a clan of Neanderthals",
  denisovan: "a group of Denisovans",
};

/**
 * Presentation for each choice-driven event chain. The trade-off logic lives in
 * {@link resolveChoice}; this is just the framing the UI shows. Option 0 is
 * always the cautious choice, option 1 the risky one.
 */
const EVENT_CHAIN_DEF: Record<
  EventChainId,
  { title: string; message: string; options: [ChoiceOption, ChoiceOption] }
> = {
  hardWinter: {
    title: "A hard winter",
    message: "The cold bites deep and the stores run thin. How will the tribe endure?",
    options: [
      { label: "Ration the stores", hint: "spend food, no one is lost" },
      { label: "Risk a winter hunt", hint: "more food, but the weak may not return" },
    ],
  },
  sickCamp: {
    title: "Sickness in the camp",
    message: "A fever spreads through the band. Tend the afflicted or let it run its course?",
    options: [
      { label: "Tend the sick", hint: "spend food, the camp recovers" },
      { label: "Let it run", hint: "costs nothing, but the frail may die" },
    ],
  },
  rivalCache: {
    title: "A rival's granary",
    message: "Scouts find a neighbouring camp's food cache. Bargain for a share, or take it?",
    options: [
      { label: "Trade for a share", hint: "some food, no blood spilled" },
      { label: "Raid the cache", hint: "much more food, but lives at risk" },
    ],
  },
  prophet: {
    title: "A seer's vision",
    message: "A wandering seer speaks of signs in the sky. Make an offering, or follow the vision?",
    options: [
      { label: "Make an offering", hint: "spend food, the camp's spirits lift" },
      { label: "Follow the vision", hint: "hard-won insight, but the trance can kill the unready" },
    ],
  },
  migrationOmen: {
    title: "A great migration",
    message: "The herds are on the move and the omens point away. Let them pass, or follow?",
    options: [
      { label: "Let the herds pass", hint: "a lean season, but no one is lost" },
      { label: "Follow the herds", hint: "much food, but the cold trek claims the frail" },
    ],
  },
  feud: {
    title: "A blood feud",
    message: "Two families are at each other's throats. Broker a peace, or let them settle it?",
    options: [
      { label: "Broker a peace", hint: "spend food on a feast, no blood spilled" },
      { label: "Let them settle it", hint: "costs nothing, but the quarrel may turn deadly" },
    ],
  },
  bountifulFlood: {
    title: "A bountiful flood",
    message: "The river bursts its banks over the fertile plain. Move to high ground, or harvest the silt?",
    options: [
      { label: "Move to high ground", hint: "some stores spoil, but everyone is safe" },
      { label: "Harvest the flooded plain", hint: "a great haul, but some are swept away" },
    ],
  },
  stranger: {
    title: "A stranger bearing knowledge",
    message: "A lone traveller offers to share what they know. Listen at the fire, or take them in?",
    options: [
      { label: "Share a meal and listen", hint: "spend food for a little insight" },
      { label: "Take the stranger in", hint: "deep insight, but they may carry fever" },
    ],
  },
  sacredSite: {
    title: "A sacred site",
    message: "Scouts find a place that hums with old power. Honour it from afar, or claim its ground?",
    options: [
      { label: "Honour it from afar", hint: "leave offerings, the camp's spirits lift" },
      { label: "Claim the sacred ground", hint: "rich materials, but the ground is guarded" },
    ],
  },
};

/**
 * Presentation for each diplomacy event. Like {@link EVENT_CHAIN_DEF}, the
 * trade-off logic lives in {@link resolveChoice}; this is just the framing. The
 * message is templated with the rival's name. Option 0 is always the generous
 * response (spend food, warm relations), option 1 the self-serving one.
 */
const DIPLOMACY_DEF: Record<
  DiplomacyId,
  { title: string; message: (name: string) => string; options: [ChoiceOption, ChoiceOption] }
> = {
  diploGift: {
    title: "A neighbour's gift",
    message: (n) => `A gift arrives at your camp from ${n}. Send one in return, or keep it and give nothing?`,
    options: [
      { label: "Send a gift in return", hint: "spend food, relations warm" },
      { label: "Keep it, give nothing", hint: "gain food, but relations cool" },
    ],
  },
  diploTension: {
    title: "Tension at the border",
    message: (n) => `Tension flares along the border with ${n}. Offer tribute, or stand firm?`,
    options: [
      { label: "Offer tribute", hint: "spend food, relations warm" },
      { label: "Stand firm", hint: "spend nothing, but relations cool" },
    ],
  },
  diploRequest: {
    title: "A request for aid",
    message: (n) => `Word comes from ${n}, asking aid through a hard season. Send aid, or refuse?`,
    options: [
      { label: "Send aid", hint: "spend food, relations warm" },
      { label: "Refuse", hint: "keep your stores, but relations cool" },
    ],
  },
  // Only offered by a friendly rival (see maybeDiplomacy); both branches are a
  // mutually beneficial trade, so unusually neither cools relations.
  diploTrade: {
    title: "A trade caravan",
    message: (n) => `${n} sends a trade caravan, offering goods or lore for your surplus food. What will you trade for?`,
    options: [
      { label: "Trade for knowledge", hint: "spend food, gain a research boost" },
      { label: "Trade for materials", hint: "spend food, gain materials you lack" },
    ],
  },
};

export function maybeEvent(eng: SimEngine, e: Required<TechEffects>): void {
  const s = eng.state;
  if (s.tick % eng.config.eventInterval !== 0) return;

  const roll = eng.rng.next();
  const b = eng.biome();
  const settled = eraIndex(s.era) >= eraIndex("Bronze Age");
  // Difficulty preset scales how deadly random events are; 1 = standard.
  const lethal = eng.config.eventLethality ?? 1;
  if (roll < 0.35) {
    applyHazard(eng, "diseaseResistance", BALANCE.diseaseLethality * lethal * b.diseaseMult * (1 - e.diseaseDefense) * (eng.config.diseaseLethality ?? 1));
    eng.logEvent("disease", "A sickness sweeps the camp.");
  } else if (roll < 0.62) {
    // Predators in the wild; organised raids once settled.
    if (settled) {
      applyHazard(eng, "strength", BALANCE.raidLethality * lethal * e.defenseMult);
      eng.logEvent("raid", "Raiders strike at the settlement.");
    } else {
      applyHazard(eng, "strength", BALANCE.predatorLethality * lethal * b.predatorMult * e.defenseMult);
      eng.logEvent("predator", "Predators stalk the tribe.");
    }
  } else if (roll < 0.8) {
    applyHazard(eng, "coldTolerance", BALANCE.coldLethality * lethal * 0.8);
    eng.logEvent("coldSnap", "A savage cold snap descends.");
  } else {
    s.resources.food += 12 * s.world.abundance;
    eng.logEvent("bounty", "A season of plenty — food is abundant.");
  }
}

export function applyHazard(eng: SimEngine, trait: TraitName, lethality: number): number {
  const s = eng.state;
  let deaths = 0;
  for (const ind of eng.living) {
    if (eng.rng.chance(clamp01((1 - ind.genome[trait]) * lethality))) {
      ind.alive = false;
      s.totals.deaths++;
      eng.invalidateLiving();
      deaths++;
    }
  }
  return deaths;
}

/**
 * Interbreeding with other hominin groups. While the tribe is still archaic
 * (Paleolithic/Neolithic), neighbouring bands occasionally appear; accepting
 * the encounter injects their beneficial alleles into the gene pool — a real
 * jump in trait averages plus fresh variance for selection to work on.
 */
export function maybeEncounter(eng: SimEngine): void {
  const s = eng.state;
  if (s.pendingEncounter) {
    if (s.tick > s.pendingEncounter.expiresTick) {
      eng.logEvent("encounter", `${cap(LINEAGE_NAME[s.pendingEncounter.lineage])} moved on.`);
      s.pendingEncounter = null;
    }
    return;
  }
  const archaic = eraIndex(s.era) <= eraIndex("Neolithic");
  if (!archaic || eng.living.length < 6) return;
  if (s.tick % BALANCE.encounterInterval !== 0) return;
  if (!eng.rng.chance(0.5)) return;

  const lineage = eng.rng.pick(LINEAGES);
  s.pendingEncounter = {
    lineage,
    message: `You meet ${LINEAGE_NAME[lineage]}. Interbreed to share their strengths?`,
    expiresTick: s.tick + 6,
  };
  eng.logEvent("encounter", s.pendingEncounter.message);
  eng.emitDialogue("encounter");
}

/** Resolve a pending encounter. Accepting injects new, archetype-leaning kin. */
export function resolveEncounter(eng: SimEngine, accept: boolean): void {
  const s = eng.state;
  const enc = s.pendingEncounter;
  if (!enc) return;
  s.pendingEncounter = null;
  if (!accept) {
    eng.logEvent("encounter", `The tribe kept to itself.`);
    return;
  }
  const avg = eng.traitAverages().traits;
  const lean = ARCHETYPE[enc.lineage];
  const newcomers = eng.rng.int(2, 3);
  for (let i = 0; i < newcomers; i++) {
    const genome = {} as Genome;
    for (const t of TRAITS) {
      genome[t] = clamp01(avg[t] + (lean[t] ?? 0) + eng.rng.gauss(0, 0.05));
    }
    const ind = eng.makeIndividual(genome, s.generation, eng.rng.int(16, 26));
    ind.lineage = enc.lineage;
    s.individuals.push(ind);
    eng.invalidateLiving();
    s.totals.births++;
  }
  s.totals.interbred++;
  if (!s.totals.lineagesInterbred.includes(enc.lineage)) s.totals.lineagesInterbred.push(enc.lineage);
  eng.logEvent("encounter", `Interbred with ${LINEAGE_NAME[enc.lineage]} — new blood strengthens the line.`);
}

/**
 * Choice-driven event chains. Like {@link maybeEncounter}, these surface a
 * pending decision with a trade-off that the player (or autopilot) resolves via
 * {@link resolveChoice}; ignored, they expire. Only one decision is offered at a
 * time so the UI never has to stack two modals.
 */
export function maybeEventChain(eng: SimEngine): void {
  const s = eng.state;
  if (s.pendingChoice) {
    if (s.tick > s.pendingChoice.expiresTick) {
      eng.logEvent("choice", `The moment to act passed — ${s.pendingChoice.title.toLowerCase()} went unanswered.`);
      s.pendingChoice = null;
    }
    return;
  }
  if (s.pendingEncounter) return;
  if (eng.living.length < 4) return;
  if (s.tick % BALANCE.eventChainInterval !== 0) return;
  if (!eng.rng.chance(0.5)) return;

  const eligible = eligibleEventChains(s, eng.living);
  if (eligible.length === 0) return;
  const id = eng.rng.pick(eligible);
  s.pendingChoice = { id, ...EVENT_CHAIN_DEF[id], expiresTick: s.tick + 6 };
  if (!s.totals.eventChainsSeen.includes(id)) s.totals.eventChainsSeen.push(id);
  eng.logEvent("choice", s.pendingChoice.message);
  eng.emitDialogue("eventChain");
}

/** Which event chains the current world state can offer right now. */
function eligibleEventChains(s: SimState, living: Individual[]): EventChainId[] {
  const out: EventChainId[] = [];
  if (s.world.cold > 0.5) out.push("hardWinter");
  if (living.length >= 8) out.push("sickCamp");
  if (eraIndex(s.era) >= eraIndex("Bronze Age")) out.push("rivalCache");
  // Always-available chains: mysticism, herds and sacred ground need no setup.
  out.push("prophet", "migrationOmen", "sacredSite");
  if (living.length >= 10) out.push("feud");
  // Floods matter to settled farmers; trade strangers travel established routes.
  if (eraIndex(s.era) >= eraIndex("Neolithic")) out.push("bountifulFlood", "stranger");
  return out;
}

/**
 * Periodic diplomacy with a rival tribe. Mirrors {@link maybeEventChain} —
 * surfaces a pending choice via the same mechanism — but it concerns a specific
 * rival (`rivalId`) and its outcome shifts that rival's relations score. The
 * trigger draws on the rival RNG stream, so deciding *when* a neighbour reaches
 * out never perturbs the player's own simulation or replay.
 */
export function maybeDiplomacy(eng: SimEngine): void {
  const s = eng.state;
  if (s.pendingChoice || s.pendingEncounter) return;
  if (s.rivals.length === 0 || eng.living.length < 4) return;
  if (s.tick % BALANCE.diplomacyInterval !== 0) return;
  if (!eng.rivalRng.chance(0.5)) return;

  const rival = eng.rivalRng.pick(s.rivals);
  // A trade caravan only comes from a rival the player has befriended; the other
  // events can come from any neighbour.
  const eligible = DIPLOMACY_EVENTS.filter(
    (id) => id !== "diploTrade" || rival.relations >= BALANCE.diploTradeMinRelations,
  );
  const id = eng.rivalRng.pick(eligible);
  const def = DIPLOMACY_DEF[id];
  s.pendingChoice = {
    id,
    title: def.title,
    message: def.message(rival.name),
    options: def.options,
    expiresTick: s.tick + 6,
    rivalId: rival.id,
  };
  eng.logEvent("choice", s.pendingChoice.message);
  eng.emitDialogue("eventChain");
}

/** A rival by id, for resolving a diplomacy choice. */
function rivalById(s: SimState, id?: string): RivalTribe | undefined {
  return id ? s.rivals.find((r) => r.id === id) : undefined;
}

/**
 * Resolve a pending choice. Option 0 is the cautious branch (a sure cost),
 * option 1 the risky branch (a bigger payoff at the cost of lives).
 */
export function resolveChoice(eng: SimEngine, option: number): void {
  const s = eng.state;
  const c = s.pendingChoice;
  if (!c) return;
  s.pendingChoice = null;
  const risky = option === 1;
  switch (c.id) {
    case "hardWinter":
      s.totals.winterChainsSurvived++;
      if (risky) {
        const gain = 18 * s.world.abundance;
        s.resources.food += gain;
        const lost = applyHazard(eng, "strength", BALANCE.predatorLethality);
        eng.logEvent("choice", `A winter hunt brings ${Math.round(gain)} food${lost ? ` — ${lost} did not return` : ""}.`);
      } else {
        s.resources.food = Math.max(0, s.resources.food - 8);
        eng.logEvent("choice", "The tribe rations its stores and waits out the cold.");
      }
      break;
    case "sickCamp":
      if (risky) {
        const lost = applyHazard(eng, "diseaseResistance", BALANCE.diseaseLethality);
        eng.logEvent("choice", `The fever runs its course${lost ? ` — ${lost} did not recover` : ""}.`);
      } else {
        s.resources.food = Math.max(0, s.resources.food - 6);
        for (const ind of eng.living) ind.health = clamp01(ind.health + 0.15);
        eng.logEvent("choice", "The tribe tends its sick back to health.");
      }
      break;
    case "rivalCache":
      if (risky) {
        const gain = 24 * s.world.abundance;
        s.resources.food += gain;
        const lost = applyHazard(eng, "strength", BALANCE.raidLethality);
        eng.logEvent("choice", `The tribe raids the cache for ${Math.round(gain)} food${lost ? ` — ${lost} fell in the fight` : ""}.`);
      } else {
        const gain = 8 * s.world.abundance;
        s.resources.food += gain;
        eng.logEvent("choice", `The tribe trades for ${Math.round(gain)} food, keeping the peace.`);
      }
      break;
    case "prophet":
      gainCulture(eng, BALANCE.cultureRitual); // a ritual deepens the tribe's belief
      if (risky) {
        grantInsight(eng, 40);
        const lost = applyHazard(eng, "intelligence", BALANCE.diseaseLethality);
        eng.logEvent("choice", `Seekers walk the seer's vision and return with insight${lost ? ` — ${lost} did not wake from the trance` : ""}.`);
      } else {
        s.resources.food = Math.max(0, s.resources.food - 6);
        for (const ind of eng.living) ind.health = clamp01(ind.health + 0.12);
        eng.logEvent("choice", "Offerings are made; the camp's spirits lift.");
      }
      break;
    case "migrationOmen":
      if (risky) {
        const gain = 20 * s.world.abundance;
        s.resources.food += gain;
        const lost = applyHazard(eng, "coldTolerance", BALANCE.coldLethality);
        eng.logEvent("choice", `The tribe follows the herds for ${Math.round(gain)} food${lost ? ` — ${lost} were lost to the cold trek` : ""}.`);
      } else {
        s.resources.food = Math.max(0, s.resources.food - 5);
        eng.logEvent("choice", "The herds pass on; the tribe weathers a lean season.");
      }
      break;
    case "feud":
      if (risky) {
        const lost = applyHazard(eng, "strength", BALANCE.raidLethality);
        eng.logEvent("choice", `The families settle it themselves${lost ? ` — ${lost} fell to the feud` : ""}.`);
      } else {
        s.resources.food = Math.max(0, s.resources.food - 7);
        for (const ind of eng.living) ind.health = clamp01(ind.health + 0.1);
        eng.logEvent("choice", "A feast reconciles the families and the camp heals.");
      }
      break;
    case "bountifulFlood":
      if (risky) {
        const gain = 24 * s.world.abundance;
        s.resources.food += gain;
        const lost = applyHazard(eng, "strength", BALANCE.predatorLethality);
        eng.logEvent("choice", `The flooded plain yields ${Math.round(gain)} food${lost ? ` — ${lost} were swept away` : ""}.`);
      } else {
        s.resources.food = Math.max(0, s.resources.food - 5);
        eng.logEvent("choice", "The tribe retreats to high ground; some stores spoil.");
      }
      break;
    case "stranger":
      if (risky) {
        grantInsight(eng, 60);
        const lost = applyHazard(eng, "diseaseResistance", BALANCE.diseaseLethality);
        eng.logEvent("choice", `The stranger teaches deeply${lost ? `, but the fever they carried took ${lost}` : ""}.`);
      } else {
        s.resources.food = Math.max(0, s.resources.food - 6);
        grantInsight(eng, 25);
        eng.logEvent("choice", "The stranger shares a meal and a little of what they know.");
      }
      break;
    case "sacredSite":
      gainCulture(eng, BALANCE.cultureRitual); // honouring the sacred ground deepens belief
      if (risky) {
        const gain = 8 * s.world.abundance;
        s.resources.materials += 10;
        s.resources.food += gain;
        const lost = applyHazard(eng, "strength", BALANCE.predatorLethality);
        eng.logEvent("choice", `The tribe claims the sacred ground — rich materials${lost ? `, but ${lost} fell to its guardians` : ""}.`);
      } else {
        s.resources.food = Math.max(0, s.resources.food - 5);
        for (const ind of eng.living) ind.health = clamp01(ind.health + 0.1);
        eng.logEvent("choice", "Offerings are left at the sacred site; the camp's spirits lift.");
      }
      break;
    case "diploGift": {
      const rival = rivalById(s, c.rivalId);
      const who = rival?.name ?? "the rival";
      if (risky) {
        s.resources.food += BALANCE.diploGiftKept;
        if (rival) shiftRelations(rival, -BALANCE.diploRelDown);
        eng.logEvent("choice", `The tribe keeps ${who}'s gift and gives nothing back — relations cool.`);
      } else {
        s.resources.food = Math.max(0, s.resources.food - BALANCE.diploReciprocateCost);
        if (rival) shiftRelations(rival, BALANCE.diploRelUp);
        eng.logEvent("choice", `A gift is sent in return to ${who} — relations warm.`);
      }
      break;
    }
    case "diploTension": {
      const rival = rivalById(s, c.rivalId);
      const who = rival?.name ?? "the rival";
      if (risky) {
        if (rival) shiftRelations(rival, -BALANCE.diploRelDown);
        eng.logEvent("choice", `The tribe stands firm against ${who} — relations cool.`);
      } else {
        s.resources.food = Math.max(0, s.resources.food - BALANCE.diploTributeCost);
        if (rival) shiftRelations(rival, BALANCE.diploRelUp);
        eng.logEvent("choice", `Tribute is paid to ${who}, defusing the tension — relations warm.`);
      }
      break;
    }
    case "diploRequest": {
      const rival = rivalById(s, c.rivalId);
      const who = rival?.name ?? "the rival";
      if (risky) {
        if (rival) shiftRelations(rival, -BALANCE.diploRelDown);
        eng.logEvent("choice", `The tribe refuses ${who}'s plea — relations cool.`);
      } else {
        s.resources.food = Math.max(0, s.resources.food - BALANCE.diploAidCost);
        if (rival) shiftRelations(rival, BALANCE.diploRelUp);
        eng.logEvent("choice", `Aid is sent to ${who} through the hard season — relations warm.`);
      }
      break;
    }
    case "diploTrade": {
      const rival = rivalById(s, c.rivalId);
      const who = rival?.name ?? "the rival";
      // Both branches are a fair exchange of surplus food: pay food, warm
      // relations, and take either a research boost or materials in return.
      s.resources.food = Math.max(0, s.resources.food - BALANCE.diploTradeFoodCost);
      if (rival) shiftRelations(rival, BALANCE.diploTradeRelUp);
      if (risky) {
        s.resources.materials += BALANCE.diploTradeMaterials;
        eng.logEvent("choice", `A fair trade with ${who} brings ${BALANCE.diploTradeMaterials} materials — relations warm.`);
      } else {
        grantInsight(eng, BALANCE.diploTradeInsight);
        eng.logEvent("choice", `Lore traded with ${who} sharpens the tribe's craft — relations warm.`);
      }
      break;
    }
  }
}

/**
 * Push research points onto the current target (cultural insight from an event).
 * Mirrors the research loop's use of {@link Knowledge.addProgress} so a gift of
 * insight can complete a tech just as ordinary research would.
 */
function grantInsight(eng: SimEngine, points: number): void {
  const s = eng.state;
  const target = s.researchTarget ?? s.knowledge.available()[0] ?? null;
  if (!target) return;
  const req = TECH_TREE[target].resourceCost;
  const ready = !req || eng.hasResources(req);
  const done = s.knowledge.addProgress(target, points, ready);
  if (done) {
    if (req) eng.spendResources(req);
    eng.logEvent("discovery", `A flash of insight completes ${TECH_TREE[done].name}!`);
  }
}

/**
 * Accrue belief: every discovered culture-category tech (burial, art, …) feeds
 * the track a little each tick. When the accrual crosses a stage threshold the
 * tribe reaches a new belief stage — a belief-flavored milestone event. This is
 * deterministic (no RNG draw), so it never perturbs any existing run or replay.
 */
export function accrueCulture(eng: SimEngine): void {
  let rate = 0;
  for (const id of eng.state.knowledge.discovered) {
    if (TECH_TREE[id].category === "culture") rate += BALANCE.culturePerCultureTech;
  }
  if (rate > 0) gainCulture(eng, rate);
}

/**
 * Add belief points, logging a belief-flavored milestone whenever the accrual
 * crosses into a new stage — whatever the source (passive cultural techs or a
 * ritual event chain). Deterministic; never touches the RNG stream.
 */
function gainCulture(eng: SimEngine, amount: number): void {
  const s = eng.state;
  const before = s.culture.level();
  s.culture.accrue(amount);
  if (s.culture.level() > before) {
    eng.logEvent("milestone", `The tribe embraces ${s.culture.stage()!.name} — belief binds them closer.`);
  }
}
