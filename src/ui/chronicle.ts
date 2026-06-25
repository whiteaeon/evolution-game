import type { GameController } from "../game/controller.js";
import {
  individualName,
  notableIndividuals,
  type Individual,
  type SimEvent,
  type SimEventType,
} from "../sim/index.js";

/**
 * The dynastic chronicle: a readable "history of the tribe" composed purely from
 * the run's event log and lineage data. Two pure builders — a roster of named
 * notable figures and the year-by-year prose entries — plus the HTML view and a
 * lightweight modal that displays them. No sim mutation, no Phaser, no RNG: it
 * only reads `sim.state.log` and `sim.state.individuals`.
 */

/** A named notable individual, ready for the chronicle's roster of figures. */
export interface ChronicleFigure {
  id: number;
  /** Procedural name from {@link individualName}. */
  name: string;
  /** Epithet, e.g. "the Long-lived". */
  title: string;
  /** The metric behind the title, e.g. "84 years". */
  detail: string;
}

/** One year's worth of logged events, woven into a single prose passage. */
export interface ChronicleEntry {
  year: number;
  /** The year's events joined into one short passage. */
  prose: string;
  /** The most salient event kind of the year, used only for styling. */
  kind: SimEventType;
}

export interface Chronicle {
  figures: ChronicleFigure[];
  entries: ChronicleEntry[];
}

// Most salient first: a milestone outshines a disaster, which outshines a
// background discovery. Used only to colour a multi-event year.
const KIND_PRIORITY: SimEventType[] = [
  "milestone",
  "choice",
  "encounter",
  "raid",
  "predator",
  "disease",
  "coldSnap",
  "bounty",
  "discovery",
  "dialogue",
];

/** The kind of the year's most salient event (falls back to the first event). */
function salientKind(events: SimEvent[]): SimEventType {
  for (const k of KIND_PRIORITY) {
    if (events.some((e) => e.type === k)) return k;
  }
  return events[0].type;
}

/** Name the notable individuals of the population, for the chronicle's roster. */
export function chronicleFigures(individuals: Individual[]): ChronicleFigure[] {
  const byId = new Map(individuals.map((i) => [i.id, i]));
  return notableIndividuals(individuals).map((n) => {
    const ind = byId.get(n.id);
    return {
      id: n.id,
      name: ind ? individualName(ind) : `#${n.id}`,
      title: n.title,
      detail: n.detail,
    };
  });
}

/**
 * Group the event log into one prose entry per year (events sharing a tick are
 * woven into a single passage), oldest first. Pure over the log: the messages it
 * weaves are the sim's own human-readable event text.
 */
export function chronicleYears(log: SimEvent[]): ChronicleEntry[] {
  const byYear = new Map<number, SimEvent[]>();
  for (const e of log) {
    const list = byYear.get(e.tick);
    if (list) list.push(e);
    else byYear.set(e.tick, [e]);
  }
  return [...byYear.keys()]
    .sort((a, b) => a - b)
    .map((year) => {
      const events = byYear.get(year)!;
      return {
        year,
        prose: events.map((e) => e.message.trim()).join(" "),
        kind: salientKind(events),
      };
    });
}

/** Compose the full chronicle (named figures + yearly prose) from sim state. */
export function composeChronicle(log: SimEvent[], individuals: Individual[]): Chronicle {
  return { figures: chronicleFigures(individuals), entries: chronicleYears(log) };
}

/** Build the inner HTML for the chronicle view. Pure string assembly. */
export function chronicleHTML(c: Chronicle): string {
  const roster = c.figures.length
    ? `<div class="chron-figures"><h4>Notable figures</h4>${c.figures
        .map(
          (f) =>
            `<div class="chron-fig"><span class="cf-name">${f.name}</span>
              <span class="cf-title">${f.title}</span>
              <span class="cf-detail dim">${f.detail}</span></div>`,
        )
        .join("")}</div>`
    : "";
  const entries = c.entries.length
    ? c.entries
        .map(
          (e) =>
            `<div class="chron-entry ev-${e.kind}"><span class="ce-year">Year ${e.year}</span>
              <p class="ce-prose">${e.prose}</p></div>`,
        )
        .join("")
    : `<p class="chron-empty">The tribe's story is yet to be written.</p>`;
  return `${roster}<h4 class="chron-h">The years</h4><div class="chron-entries">${entries}</div>`;
}

/**
 * A read-only "history book" overlay. Opens paused, composes the chronicle from
 * the live sim state, and renders it. Mirrors the family-tree modal pattern but
 * is pure HTML — it only reads the log and lineage data.
 */
export class ChronicleView {
  private host: HTMLElement;
  private ctrl: GameController;
  visible = false;

  constructor(host: HTMLElement, ctrl: GameController) {
    this.host = host;
    this.ctrl = ctrl;
    this.build();
  }

  private build(): void {
    this.host.className = "modal hidden chronmodal";
    this.host.innerHTML = `
      <div class="modal-card chron-card">
        <h3>Chronicle of the Tribe <span class="dim">— a history woven from the years</span></h3>
        <div class="chron-body" data-el="body"></div>
        <div class="modal-actions"><button data-act="chron-close">Close</button></div>
      </div>`;
    this.host.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
      if (btn?.dataset.act === "chron-close") this.hide();
    });
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }
  show(): void {
    this.visible = true;
    this.ctrl.paused = true;
    this.render();
    this.host.classList.remove("hidden");
  }
  hide(): void {
    this.visible = false;
    this.host.classList.add("hidden");
  }

  render(): void {
    if (!this.visible) return;
    const s = this.ctrl.sim.state;
    const body = this.host.querySelector('[data-el="body"]') as HTMLElement;
    body.innerHTML = chronicleHTML(composeChronicle(s.log, s.individuals));
  }
}
