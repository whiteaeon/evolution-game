import { TRAITS, type Individual, type Lineage, type TraitName } from "./types.js";

/**
 * Procedural names + "notability" for individuals — a pure helper over the same
 * lineage/genome data the family tree already walks. No RNG, no DOM, no Phaser:
 * given the individuals array it returns deterministic names and a flat list of
 * who stands out and why, which the UI renders.
 */

// ── Procedural names ─────────────────────────────────────────────────────────

// A name is two syllables plus a sex-flavoured ending, all chosen by hashing the
// id so the same person always reads the same way across renders and saves.
const FIRST = ["ka", "ta", "ma", "na", "sa", "ra", "da", "va", "la", "ha", "za", "ga"];
const SECOND = ["bo", "do", "ko", "no", "ro", "so", "to", "mo", "lo", "go", "wo", "ne"];
const FEM_END = ["a", "ia", "ya", "ena", "ira", "una", "ela"];
const MASC_END = ["or", "ak", "un", "ar", "en", "ik", "os", "ud"];

/** Bynames carried by admixed newcomers, derived from their lineage tag. */
const LINEAGE_BYNAME: Record<Lineage, string> = {
  sapiens: "the Wanderer",
  neanderthal: "the Highlander",
  denisovan: "the Eastwind",
};

function hashId(id: number): number {
  let h = (id ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A stable procedural name for an individual, derived purely from its id and
 * sex (plus a lineage byname for admixed newcomers). Deterministic: same input
 * always yields the same name.
 */
export function individualName(ind: Individual): string {
  const h = hashId(ind.id);
  const end = ind.sex === "f" ? FEM_END : MASC_END;
  const name = cap(
    FIRST[h % FIRST.length] +
      SECOND[(h >>> 4) % SECOND.length] +
      end[(h >>> 8) % end.length],
  );
  return ind.lineage ? `${name} ${LINEAGE_BYNAME[ind.lineage]}` : name;
}

// ── Notability ───────────────────────────────────────────────────────────────

export type NotableKind =
  | "longest-lived"
  | "most-descendants"
  | "trait-exemplar"
  | "first-of-lineage";

export interface Notable {
  id: number;
  kind: NotableKind;
  /** Short epithet, e.g. "the Long-lived", "the Strong", "first of the neanderthal line". */
  title: string;
  /** The metric behind the title, for a tooltip/subtitle. */
  detail: string;
}

/** Adjective epithet awarded to the champion of each trait. */
const TRAIT_EPITHET: Record<TraitName, string> = {
  strength: "the Strong",
  intelligence: "the Wise",
  dexterity: "the Deft",
  coldTolerance: "the Hardy",
  diseaseResistance: "the Hale",
  speech: "the Eloquent",
};

/** parentId → direct children ids. */
function childMap(individuals: Individual[]): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const ind of individuals) {
    for (const p of [ind.motherId, ind.fatherId]) {
      if (p === undefined) continue;
      const list = m.get(p);
      if (list) list.push(ind.id);
      else m.set(p, [ind.id]);
    }
  }
  return m;
}

/** Count unique transitive descendants of `rootId` (pedigree collapse = once). */
function countDescendants(children: Map<number, number[]>, rootId: number): number {
  const seen = new Set<number>();
  const stack = [...(children.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const k of children.get(id) ?? []) stack.push(k);
  }
  return seen.size;
}

/**
 * Pick out the notable individuals from a population: the longest-lived, the one
 * with the most descendants, the champion of each trait, and the first arrival
 * of each admixed lineage. Returns one entry per category (ties broken by lowest
 * id for stability). Empty input → empty list.
 */
export function notableIndividuals(individuals: Individual[]): Notable[] {
  if (individuals.length === 0) return [];
  const out: Notable[] = [];

  // Longest-lived.
  let eldest = individuals[0];
  for (const ind of individuals) {
    if (ind.age > eldest.age || (ind.age === eldest.age && ind.id < eldest.id)) eldest = ind;
  }
  out.push({
    id: eldest.id,
    kind: "longest-lived",
    title: "the Long-lived",
    detail: `${eldest.age} years`,
  });

  // Most descendants (only if anyone has any).
  const children = childMap(individuals);
  let bestId = -1;
  let bestCount = 0;
  for (const ind of individuals) {
    const c = countDescendants(children, ind.id);
    if (c > bestCount || (c === bestCount && c > 0 && ind.id < bestId)) {
      bestCount = c;
      bestId = ind.id;
    }
  }
  if (bestCount > 0) {
    out.push({
      id: bestId,
      kind: "most-descendants",
      title: "the Prolific",
      detail: `${bestCount} descendants`,
    });
  }

  // Trait champions — one per trait.
  for (const t of TRAITS) {
    let champ = individuals[0];
    for (const ind of individuals) {
      if (
        ind.genome[t] > champ.genome[t] ||
        (ind.genome[t] === champ.genome[t] && ind.id < champ.id)
      ) {
        champ = ind;
      }
    }
    out.push({
      id: champ.id,
      kind: "trait-exemplar",
      title: TRAIT_EPITHET[t],
      detail: `${t} ${champ.genome[t].toFixed(2)}`,
    });
  }

  // First arrival of each admixed lineage.
  const lineageFirst = new Map<Lineage, number>();
  for (const ind of individuals) {
    if (!ind.lineage) continue;
    const cur = lineageFirst.get(ind.lineage);
    if (cur === undefined || ind.id < cur) lineageFirst.set(ind.lineage, ind.id);
  }
  for (const [lineage, id] of lineageFirst) {
    out.push({
      id,
      kind: "first-of-lineage",
      title: `first of the ${lineage} line`,
      detail: lineage,
    });
  }

  return out;
}

/** Group notability entries by individual id, for quick lookup in the UI. */
export function notableById(individuals: Individual[]): Map<number, Notable[]> {
  const m = new Map<number, Notable[]>();
  for (const n of notableIndividuals(individuals)) {
    const list = m.get(n.id);
    if (list) list.push(n);
    else m.set(n.id, [n]);
  }
  return m;
}
