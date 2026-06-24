import type { GameController } from "../game/controller.js";
import { TECH_TREE, TECH_ORDER } from "../sim/knowledge.js";
import {
  ERAS,
  TRAITS,
  TASKS,
  DIFFICULTIES,
  DIFFICULTY_PRESETS,
  regionById,
  type Difficulty,
  type Era,
  type Task,
  type TechId,
  type TraitName,
} from "../sim/index.js";
import { ACHIEVEMENTS } from "../game/achievements.js";
import { Audio } from "./audio.js";
import { MapView } from "./map.js";
import { FamilyTree } from "./familytree.js";
import { keyboardShortcut } from "./shortcuts.js";
import { eraSpans, traitDeltas, summaryHTML, type EraEntry } from "./summary.js";

const TRAIT_LABEL: Record<TraitName, string> = {
  strength: "Strength",
  intelligence: "Intelligence",
  dexterity: "Dexterity",
  coldTolerance: "Cold Tolerance",
  diseaseResistance: "Disease Resist.",
  speech: "Speech",
};

const ASSIGNABLE: Task[] = TASKS.filter((t) => t !== "idle");
const TASK_LABEL: Record<Task, string> = {
  gather: "🌿 Gather",
  hunt: "🦴 Hunt",
  cook: "🔥 Cook",
  build: "🛖 Build",
  research: "💡 Research",
  idle: "Idle",
};
const TASK_TECH: Partial<Record<Task, TechId>> = { cook: "cooking", hunt: "hunting" };
const LANGUAGE_STEPS = ["Grunts", "Gestures", "Symbols", "Speech", "Writing", "Print"];
const SEASONS = ["❄ Winter", "🌱 Spring", "☀ Summer", "🍂 Autumn"];
const TUTORIAL_KEY = "dawn-tutorial-seen";
const GOAL_NUDGE_KEY = "dawn-goal-dismissed";

export class UIOverlay {
  private root: HTMLElement;
  private ctrl: GameController;
  private audio = new Audio();
  private el: Record<string, HTMLElement> = {};
  private popHistory: number[] = [];
  private intHistory: number[] = [];
  /** End-screen history, tracked across renders from sim state. */
  private eraLog: EraEntry[] = [];
  private startTraits: Record<TraitName, number> | null = null;
  private peakPop = 0;
  private trackedSim: GameController["sim"] | null = null;
  private lastSample = -1;
  private lastTechCount = -1;
  private lastEra = "";
  private lastBirths = -1;
  private lastDiscovered = -1;
  private graphCtx: CanvasRenderingContext2D | null = null;
  private map: MapView;
  private tree: FamilyTree;

  constructor(root: HTMLElement, ctrl: GameController) {
    this.root = root;
    this.ctrl = ctrl;
    this.build();
    // Full-screen overlays live outside the side panel so they cover the world.
    const mapHost = document.createElement("div");
    const treeHost = document.createElement("div");
    document.body.append(mapHost, treeHost);
    this.map = new MapView(mapHost, ctrl);
    this.tree = new FamilyTree(treeHost, ctrl);
    this.bindKeyboard();
    if (!localStorage.getItem(TUTORIAL_KEY)) this.el.tutorial.classList.remove("hidden");
  }

  /** Update the controller speed and reflect it in the speed-button highlight. */
  private applySpeed(mult: number): void {
    this.ctrl.setSpeed(mult);
    this.root
      .querySelectorAll("[data-speed]")
      .forEach((b) =>
        b.classList.toggle("on", Number((b as HTMLElement).dataset.speed) === mult),
      );
  }

  /** Global keyboard shortcuts: Space pause, 1/2/4 speed, m map, f family. */
  private bindKeyboard(): void {
    window.addEventListener("keydown", (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const sc = keyboardShortcut(e.key);
      if (!sc) return;
      e.preventDefault();
      this.audio.click();
      switch (sc.kind) {
        case "pause": this.ctrl.togglePause(); break;
        case "speed": this.applySpeed(sc.mult); break;
        case "map": this.map.toggle(); break;
        case "family": this.tree.toggle(); break;
      }
    });
  }

  private build(): void {
    this.root.innerHTML = `
      <div class="panel hdr">
        <h1>Dawn of the Tribe</h1>
        <div class="era" data-el="era">Paleolithic</div>
        <div class="hdr-stats">
          <span>Year <b data-el="year">0</b></span>
          <span>Gen <b data-el="gen">0</b></span>
          <span>Pop <b data-el="pop">0</b></span>
          <span data-el="season">❄ Winter</span>
        </div>
        <div class="goal hidden" data-el="goal">
          <span class="goal-label">Next objective</span>
          <span class="goal-text" data-el="goal-text"></span>
          <button class="goal-x" data-act="goal-dismiss" title="Dismiss">×</button>
        </div>
        <div class="eratrack" data-el="eratrack"></div>
      </div>

      <div class="panel">
        <div class="controls">
          <button data-act="pause" class="big" title="Pause / play (Space)">▶ Play</button>
          <div class="speeds">
            <button data-speed="1" class="on" title="Normal speed (1)">1×</button>
            <button data-speed="2" title="Double speed (2)">2×</button>
            <button data-speed="4" title="Quadruple speed (4)">4×</button>
          </div>
          <button data-act="sound" aria-label="Toggle sound" title="Toggle sound">🔇</button>
        </div>
        <div class="controls2">
          <button data-act="map" title="World map (M)">🗺 Map</button>
          <button data-act="family" title="Family tree (F)">🌳 Family</button>
          <button data-act="save">💾 Save</button>
          <button data-act="load">📂 Load</button>
          <button data-act="new">🔄 New</button>
        </div>
        <label class="newrun">Difficulty (next run)
          <select data-el="difficulty">
            ${DIFFICULTIES.map(
              (d) =>
                `<option value="${d}"${d === "standard" ? " selected" : ""} title="${DIFFICULTY_PRESETS[d].blurb}">${DIFFICULTY_PRESETS[d].label}</option>`,
            ).join("")}
          </select>
        </label>
        <div class="resources" data-el="resources"></div>
        <div class="legacy" data-el="legacy"></div>
      </div>

      <div class="panel">
        <h2>Genome — tribe average</h2>
        <div class="traits" data-el="traits"></div>
        <canvas class="graph" data-el="graph" width="320" height="56"></canvas>
        <div class="graphkey"><span class="k-pop">● population</span> <span class="k-int">● intelligence</span></div>
      </div>

      <div class="panel">
        <h2>Assign the tribe <span class="dim" data-el="labor"></span></h2>
        <div class="tasks" data-el="tasks"></div>
        <div class="lang" data-el="lang"></div>
      </div>

      <div class="panel">
        <h2>Tech tree <span class="dim">(click an available tech to research)</span></h2>
        <div class="techtree" data-el="techtree"></div>
      </div>

      <div class="panel">
        <h2>Achievements <span class="dim" data-el="ach-count"></span></h2>
        <div class="badges" data-el="badges"></div>
      </div>

      <div class="panel grow">
        <h2>Chronicle</h2>
        <div class="log" data-el="log"></div>
      </div>

      <div class="modal hidden" data-el="encounter">
        <div class="modal-card">
          <h3>A meeting of peoples</h3>
          <p data-el="encounter-text"></p>
          <div class="modal-actions">
            <button data-act="interbreed-yes" class="primary">Interbreed</button>
            <button data-act="interbreed-no">Keep apart</button>
          </div>
        </div>
      </div>

      <div class="modal hidden" data-el="choice">
        <div class="modal-card">
          <h3 data-el="choice-title"></h3>
          <p data-el="choice-text"></p>
          <div class="modal-actions">
            <button data-act="choice-0" class="primary"></button>
            <button data-act="choice-1"></button>
          </div>
        </div>
      </div>

      <div class="modal hidden" data-el="endscreen">
        <div class="modal-card" data-el="end-card">
          <h3 data-el="end-title"></h3>
          <p data-el="end-body"></p>
          <div class="end-summary" data-el="end-summary"></div>
          <div class="modal-actions">
            <button data-act="new" class="primary">Begin a new lineage</button>
          </div>
        </div>
      </div>

      <div class="tutorial hidden" data-el="tutorial">
        <div class="modal-card">
          <h3>Guide your tribe from the Stone Age to the Information Age</h3>
          <ol>
            <li><b>Start here:</b> press <b>▶ Play</b> and pick a speed (1× / 2× / 4×).</li>
            <li><b>Feed everyone:</b> assign people to 🌿 Gather and 🦴 Hunt below.</li>
            <li><b>Advance:</b> assign 💡 Research and follow the <b>Next objective</b> nudge up top for what to unlock next.</li>
            <li><b>Explore:</b> use <b>🗺 Map</b> to migrate between regions and <b>🌳 Family</b> to trace your lineage.</li>
            <li>Meet other peoples and <b>interbreed</b> for new strengths. Reach the <b>Information Age</b> to win.</li>
          </ol>
          <div class="modal-actions">
            <button data-act="tutorial-ok">Skip</button>
            <button data-act="tutorial-ok" class="primary">Let's begin</button>
          </div>
        </div>
      </div>
    `;

    const q = (sel: string) => this.root.querySelector(sel) as HTMLElement;
    for (const k of [
      "era", "year", "gen", "pop", "season", "goal", "goal-text", "eratrack", "resources", "legacy", "difficulty",
      "traits", "graph", "labor", "tasks", "lang", "techtree", "badges", "ach-count", "log",
      "encounter", "encounter-text", "choice", "choice-title", "choice-text",
      "endscreen", "end-title", "end-body", "end-summary", "end-card", "tutorial",
    ]) {
      this.el[k] = q(`[data-el="${k}"]`);
    }

    this.el.traits.innerHTML = TRAITS.map(
      (t) => `<div class="trait"><span class="tname">${TRAIT_LABEL[t]}</span>
        <span class="bar"><i data-bar="${t}"></i></span>
        <span class="tval" data-tval="${t}">0.00</span></div>`,
    ).join("");

    this.el.tasks.innerHTML = ASSIGNABLE.map(
      (t) => `<div class="task"><span class="kname">${TASK_LABEL[t]}</span>
        <button data-task-dec="${t}">−</button><b data-task-n="${t}">0</b><button data-task-inc="${t}">+</button>
        <span class="hint" data-task-hint="${t}"></span></div>`,
    ).join("");

    this.el.eratrack.innerHTML = ERAS.map(
      (e) => `<span class="erapip" data-erapip="${e}">${e}</span>`,
    ).join('<span class="eraarrow">›</span>');

    this.graphCtx = (this.el.graph as HTMLCanvasElement).getContext("2d");
    this.bind();
  }

  private bind(): void {
    (this.el.difficulty as HTMLSelectElement).addEventListener("change", (e) => {
      this.ctrl.setDifficulty((e.target as HTMLSelectElement).value as Difficulty);
      this.audio.click();
    });
    this.root.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const btn = t.closest("button") as HTMLButtonElement | null;
      if (!btn) {
        const tech = t.closest("[data-tech]") as HTMLElement | null;
        if (tech) {
          this.ctrl.sim.setResearchTarget(tech.dataset.tech as TechId);
          this.audio.click();
        }
        return;
      }
      const a = btn.dataset.act;
      if (a !== "sound") this.audio.click();
      if (btn.dataset.act === "pause") this.ctrl.togglePause();
      if (btn.dataset.speed) this.applySpeed(Number(btn.dataset.speed));
      if (btn.dataset.taskInc) this.ctrl.adjustTask(btn.dataset.taskInc as Task, +1);
      if (btn.dataset.taskDec) this.ctrl.adjustTask(btn.dataset.taskDec as Task, -1);
      if (a === "sound") btn.textContent = this.audio.toggle() ? "🔊" : "🔇";
      if (a === "save") { this.ctrl.save(); this.flash(btn, "Saved!"); }
      if (a === "load") { if (this.ctrl.load()) this.flash(btn, "Loaded!"); }
      if (a === "new") this.ctrl.newGame();
      if (a === "map") this.map.toggle();
      if (a === "family") this.tree.toggle();
      if (a === "interbreed-yes") { this.ctrl.resolveEncounter(true); this.ctrl.paused = false; }
      if (a === "interbreed-no") { this.ctrl.resolveEncounter(false); this.ctrl.paused = false; }
      if (a === "choice-0") { this.ctrl.resolveChoice(0); this.ctrl.paused = false; }
      if (a === "choice-1") { this.ctrl.resolveChoice(1); this.ctrl.paused = false; }
      if (a === "tutorial-ok") { this.el.tutorial.classList.add("hidden"); localStorage.setItem(TUTORIAL_KEY, "1"); }
      if (a === "goal-dismiss") {
        localStorage.setItem(GOAL_NUDGE_KEY, this.el["goal-text"].textContent || "");
        this.el.goal.classList.add("hidden");
      }
    });
  }

  private flash(btn: HTMLElement, msg: string): void {
    const old = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => (btn.textContent = old), 900);
  }

  render(): void {
    const sim = this.ctrl.sim;
    const s = sim.state;
    const avg = sim.traitAverages();
    this.trackEndStats(s, avg);

    this.el.era.textContent = s.era;
    this.el.era.dataset.era = s.era;
    this.el.year.textContent = String(s.tick);
    this.el.gen.textContent = String(s.generation);
    this.el.pop.textContent = String(avg.count);
    this.el.season.textContent = SEASONS[s.world.seasonIndex];
    // Next-objective nudge: show the current goal unless this exact goal was dismissed.
    this.el["goal-text"].textContent = s.goal;
    this.el.goal.classList.toggle(
      "hidden",
      !s.goal || localStorage.getItem(GOAL_NUDGE_KEY) === s.goal,
    );

    (this.root.querySelector('[data-act="pause"]') as HTMLElement).textContent = this.ctrl.paused
      ? "▶ Play"
      : "⏸ Pause";

    // era track highlight
    const eraIdx = ERAS.indexOf(s.era);
    this.audio.setEra(eraIdx);
    this.root.querySelectorAll("[data-erapip]").forEach((p) => {
      const pe = (p as HTMLElement).dataset.erapip as Era;
      p.classList.toggle("done", ERAS.indexOf(pe) < eraIdx);
      p.classList.toggle("here", pe === s.era);
    });

    this.el.resources.innerHTML = [
      `🍖 Food <b>${Math.floor(s.resources.food)}</b>`,
      `🏠 ${cap(s.shelter)}`,
      `🗺 ${regionById(s.region).name} <span class="dim2">(${s.biome})</span>`,
      s.cookingActive ? `<span class="cooking">cooking ✓</span>` : "",
    ].filter(Boolean).join("<span class='sep'>·</span>");

    if (this.map.visible) this.map.render();
    if (this.tree.visible) this.tree.render();

    this.el.legacy.innerHTML = this.ctrl.legacy.runs
      ? `Legacy: run #${this.ctrl.legacy.runs + 1} · best ${ERAS[this.ctrl.legacy.bestEraIndex]}`
      : "";

    for (const t of TRAITS) {
      const v = avg.traits[t as TraitName];
      (this.root.querySelector(`[data-bar="${t}"]`) as HTMLElement).style.width = `${Math.round(v * 100)}%`;
      (this.root.querySelector(`[data-tval="${t}"]`) as HTMLElement).textContent = v.toFixed(2);
    }

    this.el.labor.textContent = `(${this.ctrl.assigned} assigned / ${this.ctrl.adults} adults)`;
    for (const t of ASSIGNABLE) {
      (this.root.querySelector(`[data-task-n="${t}"]`) as HTMLElement).textContent = String(sim.allocation[t]);
      const need = TASK_TECH[t];
      (this.root.querySelector(`[data-task-hint="${t}"]`) as HTMLElement).textContent =
        need && !s.knowledge.has(need) ? `needs ${TECH_TREE[need].name}` : "";
    }

    // language chain
    const lvl = s.knowledge.languageLevel();
    this.el.lang.innerHTML =
      "🗣 " +
      LANGUAGE_STEPS.map((w, i) => `<span class="${i <= lvl ? "on" : ""}">${w}</span>`).join(" › ");

    this.renderTechTree(s);
    this.renderBadges();
    this.sampleAndDrawGraph(avg.count, avg.traits.intelligence);

    this.el.log.innerHTML = s.log
      .slice(-8)
      .reverse()
      .map((e) => `<div class="ev ev-${e.type}"><span>y${e.tick}</span> ${e.message}</div>`)
      .join("");

    // encounter modal
    if (s.pendingEncounter) {
      this.el.encounter.classList.remove("hidden");
      this.el["encounter-text"].textContent = s.pendingEncounter.message;
    } else {
      this.el.encounter.classList.add("hidden");
    }

    // choice-driven event-chain modal
    if (s.pendingChoice) {
      this.el.choice.classList.remove("hidden");
      this.el["choice-title"].textContent = s.pendingChoice.title;
      this.el["choice-text"].textContent = s.pendingChoice.message;
      const [o0, o1] = s.pendingChoice.options;
      (this.root.querySelector('[data-act="choice-0"]') as HTMLElement).textContent = `${o0.label} (${o0.hint})`;
      (this.root.querySelector('[data-act="choice-1"]') as HTMLElement).textContent = `${o1.label} (${o1.hint})`;
    } else {
      this.el.choice.classList.add("hidden");
    }

    // milestone sound + end screen
    if (s.era !== this.lastEra) {
      if (this.lastEra) this.audio.chime();
      this.lastEra = s.era;
    }

    // light SFX on births and discoveries (only after the first frame baseline)
    const discovered = s.knowledge.discovered.size;
    if (this.lastBirths >= 0 && s.totals.births > this.lastBirths) this.audio.birth();
    if (this.lastDiscovered >= 0 && discovered > this.lastDiscovered) this.audio.discovery();
    this.lastBirths = s.totals.births;
    this.lastDiscovered = discovered;
    this.renderEndScreen(s, avg.count);
  }

  private renderTechTree(s: GameController["sim"]["state"]): void {
    const known = s.knowledge.discovered.size;
    if (known === this.lastTechCount && this.el.techtree.childElementCount) {
      // only the active research bar changes frequently — cheap update
      for (const id of TECH_ORDER) {
        const bar = this.root.querySelector(`[data-techbar="${id}"]`) as HTMLElement | null;
        if (bar) bar.style.width = `${Math.min(100, Math.round((s.knowledge.progress[id] / TECH_TREE[id].cost) * 100))}%`;
        const node = this.root.querySelector(`[data-technode="${id}"]`) as HTMLElement | null;
        if (node) node.classList.toggle("target", s.researchTarget === id);
      }
      return;
    }
    this.lastTechCount = known;
    this.el.techtree.innerHTML = ERAS.map((era) => {
      const techs = TECH_ORDER.filter((t) => TECH_TREE[t].era === era);
      const rows = techs
        .map((id) => {
          const def = TECH_TREE[id];
          const has = s.knowledge.has(id);
          const open = s.knowledge.isUnlocked(id);
          const cls = has ? "known" : open ? "open" : "locked";
          const pct = Math.min(100, Math.round((s.knowledge.progress[id] / def.cost) * 100));
          return `<div class="tech ${cls}" data-technode="${id}" ${open ? `data-tech="${id}"` : ""} title="${def.blurb}">
            <span class="tlabel">${has ? "✓" : ""} ${def.name}<i class="cat cat-${def.category}"></i></span>
            ${!has ? `<span class="tprog"><i data-techbar="${id}" style="width:${pct}%"></i></span>` : ""}
          </div>`;
        })
        .join("");
      return `<div class="techera"><div class="techera-h">${era}</div>${rows}</div>`;
    }).join("");
  }

  private lastUnlocked = -1;

  /** Small badges panel: locked goals are visible (greyed); unlocked ones glow. */
  private renderBadges(): void {
    const unlocked = new Set(this.ctrl.unlocked);
    if (unlocked.size === this.lastUnlocked) return; // only changes on a new unlock
    this.lastUnlocked = unlocked.size;
    this.el["ach-count"].textContent = `(${unlocked.size}/${ACHIEVEMENTS.length})`;
    this.el.badges.innerHTML = ACHIEVEMENTS.map((a) => {
      const got = unlocked.has(a.id);
      return `<div class="badge ${got ? "got" : "locked"}" title="${a.description}">
        <span class="badge-i">${got ? "🏅" : "🔒"}</span>
        <span class="badge-t">${a.title}</span>
      </div>`;
    }).join("");
  }

  private sampleAndDrawGraph(pop: number, intel: number): void {
    if (this.ctrl.tickStamp !== this.lastSample) {
      this.lastSample = this.ctrl.tickStamp;
      this.popHistory.push(pop);
      this.intHistory.push(intel);
      if (this.popHistory.length > 160) this.popHistory.shift();
      if (this.intHistory.length > 160) this.intHistory.shift();
    }
    const ctx = this.graphCtx;
    if (!ctx) return;
    const W = 320;
    const H = 56;
    ctx.clearRect(0, 0, W, H);
    const maxPop = Math.max(20, ...this.popHistory);
    const line = (data: number[], max: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = (i / Math.max(1, data.length - 1)) * (W - 2) + 1;
        const y = H - 2 - (v / max) * (H - 4);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    };
    line(this.popHistory, maxPop, "#ffb454");
    line(this.intHistory, 1, "#7fd0ff");
  }

  /**
   * Accumulate the per-run history the end screen draws from: era timeline,
   * starting trait averages, and peak population. Resets when a new run begins
   * (the controller swaps in a fresh Simulation). Pure reads of sim state.
   */
  private trackEndStats(s: GameController["sim"]["state"], avg: { count: number; traits: Record<TraitName, number> }): void {
    if (this.trackedSim !== this.ctrl.sim) {
      this.trackedSim = this.ctrl.sim;
      this.eraLog = [];
      this.startTraits = null;
      this.peakPop = 0;
    }
    if (!this.startTraits) this.startTraits = { ...avg.traits };
    if (avg.count > this.peakPop) this.peakPop = avg.count;
    const last = this.eraLog[this.eraLog.length - 1];
    if (!last || last.era !== s.era) this.eraLog.push({ era: s.era, startTick: s.tick });
  }

  private renderEndScreen(s: GameController["sim"]["state"], pop: number): void {
    const ended = s.won || pop === 0;
    if (!ended) {
      this.el.endscreen.classList.add("hidden");
      return;
    }
    if (!this.el.endscreen.classList.contains("hidden")) return; // already shown
    this.el.endscreen.classList.remove("hidden");
    const card = this.el["end-card"];
    if (s.won) {
      card.classList.add("win");
      this.el["end-title"].textContent = "🛰️ You reached the Information Age!";
      this.el["end-body"].innerHTML = `From a handful of stone-age hominins to a connected civilization in <b>${s.tick} years</b> and <b>${s.generation} generations</b>.`;
      this.audio.chime();
    } else {
      card.classList.add("dead");
      this.el["end-title"].textContent = "💀 The line has ended";
      this.el["end-body"].innerHTML = `Your tribe reached the <b>${s.era}</b> before the cold and the wild outlasted them, at year ${s.tick}.<br>Their legacy strengthens the next.`;
      this.audio.knell();
    }
    this.el["end-summary"].innerHTML = this.buildSummary(s);
  }

  /** Assemble the end-of-run summary HTML from the tracked per-run history. */
  private buildSummary(s: GameController["sim"]["state"]): string {
    const final = this.ctrl.sim.traitAverages().traits;
    let eldest: { age: number; generation: number } | null = null;
    for (const ind of s.individuals) {
      if (!eldest || ind.age > eldest.age) eldest = { age: ind.age, generation: ind.generation };
    }
    return summaryHTML(
      {
        eras: eraSpans(this.eraLog, s.tick),
        traits: traitDeltas(this.startTraits ?? final, final),
        peakPop: this.peakPop,
        totals: s.totals,
        eldest,
      },
      (t) => TRAIT_LABEL[t],
    );
  }
}

const cap = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
