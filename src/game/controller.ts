import { Simulation, type Task } from "../sim/index.js";
import { foldLegacy, loadLegacy, saveLegacy, type Legacy } from "./legacy.js";
import { loadAchievements, mergeUnlocked, saveAchievements, type AchievementId } from "./achievements.js";

const SAVE_KEY = "dawn-of-the-tribe-save";

/**
 * The single source of truth shared by the render scene and the DOM UI. Owns the
 * pure {@link Simulation}, paces real time into sim ticks, threads the roguelite
 * legacy through new runs, and brokers save/load. No Phaser imports.
 */
export class GameController {
  sim!: Simulation;
  paused = true;
  speed = 1;
  readonly baseTicksPerSec = 0.9;
  legacy: Legacy;
  /** Achievements unlocked across all runs (persisted, sticky). */
  unlocked: AchievementId[];
  /** Set once a run has ended (won/extinct) and been folded into the legacy. */
  private recorded = false;

  private acc = 0;
  tickStamp = 0;

  constructor() {
    this.legacy = loadLegacy();
    this.unlocked = loadAchievements();
    this.startRun();
  }

  private startRun(seed = (Math.random() * 1e9) | 0): void {
    this.sim = new Simulation({
      seed,
      baseCold: 0.45,
      startingPopulation: 10,
      carryingCapacityBase: 16,
      founderBonus: this.legacy.bonus,
    });
    this.sim.setAllocation("gather", 4);
    this.sim.setAllocation("hunt", 2);
    this.sim.setAllocation("research", 2);
    this.sim.setAllocation("cook", 1);
    this.sim.setAllocation("build", 1);
    this.recorded = false;
    this.paused = true;
  }

  get adults(): number {
    return this.sim.living.filter(
      (i) => i.age >= this.sim.config.reproMinAge - 4 && i.health > 0.15,
    ).length;
  }

  get assigned(): number {
    let n = 0;
    for (const t of ["gather", "hunt", "cook", "build", "research"] as Task[])
      n += this.sim.allocation[t];
    return n;
  }

  get ended(): boolean {
    return this.sim.state.won || this.sim.living.length === 0;
  }

  togglePause(): void {
    this.paused = !this.paused;
  }
  setSpeed(mult: number): void {
    this.speed = mult;
  }
  adjustTask(task: Task, delta: number): void {
    this.sim.setAllocation(task, this.sim.allocation[task] + delta);
  }
  resolveEncounter(accept: boolean): void {
    this.sim.resolveEncounter(accept);
  }
  resolveChoice(option: number): void {
    this.sim.resolveChoice(option);
  }

  update(dtMs: number): void {
    this.syncAchievements();
    if (this.ended) {
      this.recordEnd();
      return;
    }
    if (this.paused) return;
    this.acc += dtMs / 1000;
    const interval = 1 / (this.baseTicksPerSec * this.speed);
    let guard = 0;
    while (this.acc >= interval && guard++ < 50) {
      this.acc -= interval;
      this.sim.tick();
      this.tickStamp++;
      if (this.ended) break;
      // Auto-pause to surface a pending decision (encounter or event chain).
      if (this.sim.state.pendingEncounter || this.sim.state.pendingChoice) {
        this.paused = true;
        break;
      }
    }
  }

  /** Fold any newly-earned achievements into the sticky set and persist on change. */
  private syncAchievements(): void {
    const next = mergeUnlocked(this.unlocked, this.sim.state);
    if (next.length !== this.unlocked.length) {
      this.unlocked = next;
      saveAchievements(next);
    }
  }

  /** Fold a finished run into the persistent legacy exactly once. */
  private recordEnd(): void {
    if (this.recorded) return;
    this.recorded = true;
    this.legacy = foldLegacy(this.legacy, this.sim.state.era, this.sim.traitAverages().traits);
    saveLegacy(this.legacy);
  }

  // ── save / load / new ──────────────────────────────────────────────────────

  save(): void {
    try {
      localStorage.setItem(SAVE_KEY, this.sim.serialize());
    } catch {
      /* storage unavailable */
    }
  }

  hasSave(): boolean {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  load(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      this.sim = Simulation.load(raw);
      this.recorded = false;
      this.paused = true;
      return true;
    } catch {
      return false;
    }
  }

  newGame(): void {
    if (this.ended) this.recordEnd();
    this.startRun();
  }
}
