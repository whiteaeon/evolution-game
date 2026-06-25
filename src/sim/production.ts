import { TECH_TREE } from "./knowledge.js";
import { BALANCE } from "./balance.js";
import type { SimEngine } from "./engine.js";
import type { SimEventType, TechEffects, TechId } from "./types.js";
import type { SimState } from "./simulation.js";

export function produce(eng: SimEngine, e: Required<TechEffects>): void {
  const s = eng.state;
  const k = s.knowledge;

  const b = eng.biome();
  let food = 0;
  let hide = 0;
  for (const w of eng.workers.gather) {
    const techMult = k.has("gathering") ? 1 : 0.95;
    food += BALANCE.gatherBase * (0.5 + w.genome.dexterity) * e.gatherMult * b.gatherMult * techMult * s.world.abundance;
  }
  for (const w of eng.workers.hunt) {
    const techMult = k.has("hunting") ? 1 : 0.6;
    food += BALANCE.huntBase * (0.5 + w.genome.strength) * e.huntMult * b.huntMult * techMult * s.world.abundance;
    // Hide is taken from the game that is hunted — biome-scaled, like the meat.
    hide += BALANCE.hidePerHunter * (0.5 + w.genome.strength) * e.huntMult * b.hide;
  }
  food *= e.foodMult;
  s.resources.food += food;
  s.resources.hide += hide;

  s.cookingActive = k.has("cooking") && eng.workers.cook.length > 0 && s.resources.food > 0;

  let build = 0;
  let wood = 0;
  let stone = 0;
  for (const w of eng.workers.build) {
    const eff = 0.5 + w.genome.strength * 0.5 + w.genome.dexterity * 0.5;
    build += BALANCE.buildBase * eff * e.buildMult;
    // Builders also cut wood and quarry stone, by the biome's availability.
    wood += BALANCE.woodPerBuilder * eff * e.buildMult * b.wood;
    stone += BALANCE.stonePerBuilder * eff * e.buildMult * b.stone;
  }
  s.resources.buildProgress += build;
  s.resources.materials += build * BALANCE.materialsPerBuild;
  s.resources.wood += wood;
  s.resources.stone += stone;

  doResearch(eng, e);
}

export function doResearch(eng: SimEngine, e: Required<TechEffects>): void {
  const s = eng.state;
  if (
    !s.researchTarget ||
    s.knowledge.has(s.researchTarget) ||
    !s.knowledge.isUnlocked(s.researchTarget)
  ) {
    s.researchTarget = pickResearchTarget(s);
  }
  if (!s.researchTarget) return;

  // Cooperation grows with the language chain — teamwork multiplies ideas.
  const cooperation = 1 + 0.06 * s.knowledge.languageLevel();
  let perHead = 0;
  for (const w of eng.workers.research) {
    const speechBonus = 1 + w.genome.speech * 0.5;
    perHead += BALANCE.researchBase * (0.5 + w.genome.intelligence) * speechBonus;
  }
  // Diminishing returns as the team grows (coordination cost) keeps a huge
  // late-game population from making research instantaneous.
  const teamSize = Math.max(1, eng.workers.research.length);
  let points = (perHead / teamSize) * Math.pow(teamSize, BALANCE.researchCrowding);
  // Compress the accumulated research multiplier: knowledge still accelerates
  // progress, but sub-linearly, so the late eras stay visible rather than
  // collapsing into a single tick once the multipliers compound.
  points *= Math.pow(e.researchMult, BALANCE.researchCompression) * cooperation * (eng.config.researchMult ?? 1);
  if (points <= 0) return;

  // Some techs are gated on a stock of raw resources (e.g. stone to smelt
  // bronze): research can fill up to the cost but only completes once the bill
  // is in hand, and the resources are spent when it does.
  const req = TECH_TREE[s.researchTarget].resourceCost;
  const ready = !req || eng.hasResources(req);
  const completed = s.knowledge.addProgress(s.researchTarget, points, ready);
  if (completed) {
    if (req) eng.spendResources(req);
    const def = TECH_TREE[completed];
    const kind: SimEventType = def.unlocksEra ? "milestone" : "discovery";
    eng.logEvent(kind, def.unlocksEra ? `${def.name} — the ${def.unlocksEra} begins!` : `Discovered ${def.name}.`);
    s.researchTarget = pickResearchTarget(s);
  }
}

export function pickResearchTarget(state: SimState): TechId | null {
  // available() already returns the unlocked techs filtered from TECH_ORDER, so
  // it preserves that canonical ordering — its first element IS the earliest
  // researchable tech. (The same `available()[0]` pick is used elsewhere, e.g.
  // the initial researchTarget and the event-driven fallback.) Returning it
  // directly avoids an O(n²) rescan (a linear `includes` inside a TECH_ORDER loop).
  const avail = state.knowledge.available();
  return avail[0] ?? null;
}
