import type { GameController } from "../game/controller.js";
import { TRAITS, type Individual } from "../sim/index.js";

interface Node {
  ind: Individual;
  x: number; // world coords
  y: number;
  depth: number;
  hasMore: boolean; // ancestors exist beyond the drawn depth
}

const LEVEL_H = 70;
const MAX_DEPTH = 6;

/**
 * A navigable family tree. Shows the ancestry of a focal individual — parents
 * above children, founders gold-ringed — and lets you pan, zoom, click a node to
 * inspect its traits, or climb generation by generation by re-focusing on an
 * ancestor. Drives entirely off the lineage data (motherId/fatherId).
 */
export class FamilyTree {
  private host: HTMLElement;
  private ctrl: GameController;
  private canvas!: HTMLCanvasElement;
  private cx!: CanvasRenderingContext2D;
  visible = false;

  private focalId: number | null = null;
  private inspectId: number | null = null;
  private nodes: Node[] = [];
  private panX = 0;
  private panY = 0;
  private zoom = 1;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(host: HTMLElement, ctrl: GameController) {
    this.host = host;
    this.ctrl = ctrl;
    this.build();
  }

  private build(): void {
    this.host.className = "modal hidden treemodal";
    this.host.innerHTML = `
      <div class="modal-card tree-card">
        <h3>Family Tree <span class="dim">— drag to pan, scroll to zoom, click to inspect/climb</span></h3>
        <div class="tree-body">
          <canvas data-el="canvas" width="660" height="430" class="treecanvas"></canvas>
          <div class="tree-side">
            <div class="tree-pick">
              <label>Focus: <select data-el="pick"></select></label>
              <button data-act="tree-reset">Youngest</button>
            </div>
            <div class="tree-inspect" data-el="inspect">Click a person to inspect.</div>
            <div class="tree-legend">
              <span class="lg-f">● female</span> <span class="lg-m">● male</span>
              <span class="lg-founder">◎ founder</span> <span class="lg-lin">◆ admixed</span>
            </div>
          </div>
        </div>
        <div class="modal-actions"><button data-act="tree-close">Close</button></div>
      </div>`;
    this.canvas = this.host.querySelector('[data-el="canvas"]') as HTMLCanvasElement;
    this.cx = this.canvas.getContext("2d")!;

    this.host.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
      if (btn?.dataset.act === "tree-close") this.hide();
      if (btn?.dataset.act === "tree-reset") {
        this.focalId = this.defaultFocal();
        this.recenter();
      }
    });
    this.host.querySelector('[data-el="pick"]')!.addEventListener("change", (e) => {
      this.focalId = Number((e.target as HTMLSelectElement).value);
      this.recenter();
    });

    this.canvas.addEventListener("mousedown", (e) => {
      this.dragging = true;
      this.lastX = e.offsetX;
      this.lastY = e.offsetY;
    });
    window.addEventListener("mouseup", () => (this.dragging = false));
    this.canvas.addEventListener("mousemove", (e) => {
      if (!this.dragging) return;
      this.panX += e.offsetX - this.lastX;
      this.panY += e.offsetY - this.lastY;
      this.lastX = e.offsetX;
      this.lastY = e.offsetY;
    });
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.4, Math.min(2.4, this.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
    });
    this.canvas.addEventListener("click", (e) => this.onCanvasClick(e.offsetX, e.offsetY));
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }
  show(): void {
    this.visible = true;
    this.ctrl.paused = true;
    if (this.focalId === null || !this.ctrl.sim.individualById(this.focalId)) {
      this.focalId = this.defaultFocal();
    }
    this.recenter();
    this.host.classList.remove("hidden");
  }
  hide(): void {
    this.visible = false;
    this.host.classList.add("hidden");
  }

  private defaultFocal(): number | null {
    const living = this.ctrl.sim.living;
    if (!living.length) {
      const all = this.ctrl.sim.state.individuals;
      return all.length ? all[all.length - 1].id : null;
    }
    // youngest living (deepest generation) makes for the richest ancestry
    return [...living].sort((a, b) => b.generation - a.generation)[0].id;
  }

  private recenter(): void {
    this.panX = this.canvas.width / 2;
    this.panY = this.canvas.height - 50;
    this.zoom = 1;
  }

  /** Build the ancestor layout for the focal individual. */
  private layout(): void {
    this.nodes = [];
    const focal = this.focalId !== null ? this.ctrl.sim.individualById(this.focalId) : undefined;
    if (!focal) return;
    const place = (ind: Individual, x: number, y: number, depth: number, span: number) => {
      const mother = ind.motherId !== undefined ? this.ctrl.sim.individualById(ind.motherId) : undefined;
      const father = ind.fatherId !== undefined ? this.ctrl.sim.individualById(ind.fatherId) : undefined;
      const hasParents = !!(mother || father);
      this.nodes.push({ ind, x, y, depth, hasMore: hasParents && depth >= MAX_DEPTH });
      if (depth >= MAX_DEPTH) return;
      if (mother) place(mother, x - span / 2, y - LEVEL_H, depth + 1, span / 2);
      if (father) place(father, x + span / 2, y - LEVEL_H, depth + 1, span / 2);
    };
    place(focal, 0, 0, 0, 320);
  }

  private screen(n: Node): { x: number; y: number } {
    return { x: this.panX + n.x * this.zoom, y: this.panY + n.y * this.zoom };
  }

  private onCanvasClick(mx: number, my: number): void {
    let best: Node | null = null;
    let bestD = 16 * 16;
    for (const n of this.nodes) {
      const s = this.screen(n);
      const d = (s.x - mx) ** 2 + (s.y - my) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (!best) return;
    this.inspectId = best.ind.id;
    // clicking an ancestor climbs the tree (re-focus), so deep lineages are reachable
    if (best.depth > 0) {
      this.focalId = best.ind.id;
      this.recenter();
    }
  }

  render(): void {
    if (!this.visible) return;
    this.layout();
    this.syncPicker();
    const ctx = this.cx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#221912";
    ctx.fillRect(0, 0, W, H);

    // edges (child → parent)
    ctx.strokeStyle = "#5a4632";
    ctx.lineWidth = 1.2;
    for (const n of this.nodes) {
      const c = this.screen(n);
      const mid = n.ind.motherId;
      const fid = n.ind.fatherId;
      for (const pid of [mid, fid]) {
        const pn = this.nodes.find((m) => m.ind.id === pid && m.depth === n.depth + 1);
        if (!pn) continue;
        const p = this.screen(pn);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }

    // nodes
    for (const n of this.nodes) {
      const s = this.screen(n);
      const r = (n.depth === 0 ? 9 : 7) * this.zoom;
      const founder = n.ind.motherId === undefined && n.ind.fatherId === undefined;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.ind.sex === "f" ? "#e08fb0" : "#7fb0e0";
      if (!n.ind.alive) ctx.globalAlpha = 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
      // rings: focal (white), founder (gold), inspected (accent), admixed (diamond)
      ctx.lineWidth = 2;
      if (n.ind.id === this.inspectId) { ctx.strokeStyle = "#ffb454"; ctx.stroke(); }
      else if (n.depth === 0) { ctx.strokeStyle = "#ffffff"; ctx.stroke(); }
      if (founder) { ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, r + 2.5, 0, Math.PI * 2); ctx.stroke(); }
      if (n.ind.lineage) { ctx.fillStyle = "#c9b3ff"; ctx.fillRect(s.x - 1.5, s.y - r - 5, 3, 3); }
      if (n.hasMore) { ctx.fillStyle = "#ffe08a"; ctx.fillText("▲", s.x - 3, s.y - r - 3); }
      ctx.fillStyle = "#f3e6d2";
      ctx.font = `${Math.round(9 * this.zoom)}px monospace`;
      ctx.fillText(`#${n.ind.id}`, s.x - 8, s.y + r + 9);
    }

    this.renderInspect();
  }

  private syncPicker(): void {
    const pick = this.host.querySelector('[data-el="pick"]') as HTMLSelectElement;
    const living = this.ctrl.sim.living;
    const sig = living.length + ":" + (living[0]?.id ?? 0) + ":" + (living[living.length - 1]?.id ?? 0);
    if (pick.dataset.sig === sig) {
      pick.value = String(this.focalId);
      return;
    }
    pick.dataset.sig = sig;
    const opts = [...living]
      .sort((a, b) => b.generation - a.generation)
      .slice(0, 80)
      .map((i) => `<option value="${i.id}">#${i.id} · gen ${i.generation}${i.lineage ? " · " + i.lineage : ""}</option>`)
      .join("");
    pick.innerHTML = opts;
    pick.value = String(this.focalId);
  }

  private renderInspect(): void {
    const box = this.host.querySelector('[data-el="inspect"]') as HTMLElement;
    const ind = this.inspectId !== null ? this.ctrl.sim.individualById(this.inspectId) : undefined;
    if (!ind) {
      box.innerHTML = "Click a person to inspect.";
      return;
    }
    const bars = TRAITS.map(
      (t) => `<div class="tr"><span>${t.slice(0, 4)}</span><i style="width:${Math.round(ind.genome[t] * 100)}%"></i></div>`,
    ).join("");
    box.innerHTML = `
      <div class="ins-h">#${ind.id} · ${ind.sex === "f" ? "♀" : "♂"} · gen ${ind.generation}</div>
      <div class="ins-meta">${ind.alive ? `age ${ind.age}` : "deceased"}${ind.lineage ? ` · ${ind.lineage} blood` : ""}${ind.motherId === undefined ? " · founder" : ""}</div>
      <div class="ins-bars">${bars}</div>
      ${ind.motherId !== undefined ? `<div class="ins-par">parents: #${ind.motherId} ♀ · #${ind.fatherId} ♂</div>` : ""}`;
  }
}
