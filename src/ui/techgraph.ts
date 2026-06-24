import type { GameController } from "../game/controller.js";
import { TECH_TREE, TECH_ORDER } from "../sim/knowledge.js";
import { ERAS, type Era, type TechCategory, type TechId } from "../sim/index.js";

interface GraphNode {
  id: TechId;
  x: number; // world coords, top-left of node box
  y: number;
}

const NODE_W = 132;
const NODE_H = 38;
const COL_W = 168;
const ROW_H = 50;
const PAD_X = 24;
const PAD_Y = 30;

const CATEGORY_COLOR: Record<TechCategory, string> = {
  survival: "#e0705f",
  food: "#8fcf6a",
  craft: "#d9a14b",
  culture: "#c9a0ff",
  language: "#7fd0ff",
  science: "#74c0e0",
};

/**
 * The tech tree as a node-edge graph: era columns left→right, prerequisite edges
 * drawn between techs, each node coloured by its state (known / available /
 * locked) with a research-progress bar. Pan and zoom to explore; click an
 * available tech to set it as the research target. Pure UI over the existing
 * {@link Knowledge} data — it never mutates anything but the research target.
 */
export class TechGraph {
  private host: HTMLElement;
  private ctrl: GameController;
  private canvas!: HTMLCanvasElement;
  private cx!: CanvasRenderingContext2D;
  visible = false;

  /** Static layout — node positions never change, so compute them once. */
  private readonly nodes: GraphNode[] = layoutTechs();
  private readonly byId = new Map<TechId, GraphNode>(this.nodes.map((n) => [n.id, n]));
  private inspectId: TechId | null = null;

  private panX = 0;
  private panY = 0;
  private zoom = 0.85;
  private dragging = false;
  private dragged = false;
  private lastX = 0;
  private lastY = 0;

  constructor(host: HTMLElement, ctrl: GameController) {
    this.host = host;
    this.ctrl = ctrl;
    this.build();
  }

  private build(): void {
    this.host.className = "modal hidden graphmodal";
    this.host.innerHTML = `
      <div class="modal-card graph-card">
        <h3>Tech Graph <span class="dim">— drag to pan, scroll to zoom, click an available tech to research</span></h3>
        <div class="graph-body">
          <canvas data-el="canvas" width="720" height="460" class="graphcanvas"></canvas>
          <div class="graph-side">
            <div class="graph-inspect" data-el="inspect">Click a tech to inspect.</div>
            <div class="graph-legend">
              <span class="lg-known">● known</span>
              <span class="lg-open">● available</span>
              <span class="lg-locked">● locked</span>
              <span class="lg-target">▢ research target</span>
            </div>
          </div>
        </div>
        <div class="modal-actions"><button data-act="graph-close">Close</button></div>
      </div>`;
    this.canvas = this.host.querySelector('[data-el="canvas"]') as HTMLCanvasElement;
    this.cx = this.canvas.getContext("2d")!;

    this.host.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
      if (btn?.dataset.act === "graph-close") this.hide();
    });

    this.canvas.addEventListener("mousedown", (e) => {
      this.dragging = true;
      this.dragged = false;
      this.lastX = e.offsetX;
      this.lastY = e.offsetY;
    });
    window.addEventListener("mouseup", () => (this.dragging = false));
    this.canvas.addEventListener("mousemove", (e) => {
      if (!this.dragging) return;
      const dx = e.offsetX - this.lastX;
      const dy = e.offsetY - this.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.dragged = true;
      this.panX += dx;
      this.panY += dy;
      this.lastX = e.offsetX;
      this.lastY = e.offsetY;
    });
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.4, Math.min(2, this.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
    });
    // A click that wasn't a drag selects a node (and researches it if available).
    this.canvas.addEventListener("click", (e) => {
      if (this.dragged) return;
      this.onCanvasClick(e.offsetX, e.offsetY);
    });
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }
  show(): void {
    this.visible = true;
    this.ctrl.paused = true;
    this.recenter();
    this.host.classList.remove("hidden");
    this.render();
  }
  hide(): void {
    this.visible = false;
    this.host.classList.add("hidden");
  }

  /** Frame the player's current era column, zoomed so the structure is readable. */
  private recenter(): void {
    this.zoom = 0.85;
    const ci = ERAS.indexOf(this.ctrl.sim.state.era);
    const eraX = PAD_X + ci * COL_W;
    this.panX = this.canvas.width * 0.18 - eraX * this.zoom;
    this.panY = 20;
  }

  private screenX(wx: number): number {
    return this.panX + wx * this.zoom;
  }
  private screenY(wy: number): number {
    return this.panY + wy * this.zoom;
  }

  private onCanvasClick(mx: number, my: number): void {
    const wx = (mx - this.panX) / this.zoom;
    const wy = (my - this.panY) / this.zoom;
    const hit = this.nodes.find(
      (n) => wx >= n.x && wx <= n.x + NODE_W && wy >= n.y && wy <= n.y + NODE_H,
    );
    if (!hit) return;
    this.inspectId = hit.id;
    if (this.ctrl.sim.state.knowledge.isUnlocked(hit.id)) {
      this.ctrl.sim.setResearchTarget(hit.id);
    }
  }

  render(): void {
    if (!this.visible) return;
    const k = this.ctrl.sim.state.knowledge;
    const target = this.ctrl.sim.state.researchTarget;
    const ctx = this.cx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#221912";
    ctx.fillRect(0, 0, W, H);

    this.drawEraHeaders(ctx, k.currentEra());

    // edges: prereq → tech, coloured by whether the prereq is satisfied
    ctx.lineWidth = 1.3;
    for (const n of this.nodes) {
      const from = this.screenX(n.x);
      const fromY = this.screenY(n.y + NODE_H / 2);
      for (const pid of TECH_TREE[n.id].prereqs) {
        const pn = this.byId.get(pid);
        if (!pn) continue;
        const px = this.screenX(pn.x + NODE_W);
        const py = this.screenY(pn.y + NODE_H / 2);
        ctx.strokeStyle = k.has(pid) ? "#8fcf6a" : k.has(n.id) ? "#8fcf6a" : "#5a4632";
        ctx.beginPath();
        ctx.moveTo(px, py);
        // simple S-curve so edges read clearly between columns
        const midX = (px + from) / 2;
        ctx.bezierCurveTo(midX, py, midX, fromY, from, fromY);
        ctx.stroke();
      }
    }

    // nodes
    for (const n of this.nodes) {
      const def = TECH_TREE[n.id];
      const has = k.has(n.id);
      const open = k.isUnlocked(n.id);
      const x = this.screenX(n.x);
      const y = this.screenY(n.y);
      const w = NODE_W * this.zoom;
      const h = NODE_H * this.zoom;

      ctx.fillStyle = has ? "#243a1c" : open ? "#2c2114" : "#1f1812";
      roundRect(ctx, x, y, w, h, 6 * this.zoom);
      ctx.fill();
      ctx.lineWidth = n.id === target ? 2.5 : 1;
      ctx.strokeStyle = n.id === target ? "#ffb454" : has ? "#8fcf6a" : open ? "#5a4632" : "#3a2c1d";
      ctx.stroke();

      // category swatch
      ctx.fillStyle = CATEGORY_COLOR[def.category];
      ctx.globalAlpha = has || open ? 1 : 0.5;
      ctx.fillRect(x + 5 * this.zoom, y + 5 * this.zoom, 5 * this.zoom, 5 * this.zoom);
      ctx.globalAlpha = 1;

      // research-progress fill along the bottom for in-progress (not-yet-known) techs
      if (!has) {
        const pct = Math.min(1, k.progress[n.id] / def.cost);
        if (pct > 0) {
          ctx.fillStyle = open ? "#ffb454" : "#6f5e48";
          ctx.fillRect(x + 1, y + h - 3 * this.zoom, (w - 2) * pct, 2.5 * this.zoom);
        }
      }

      // label
      ctx.fillStyle = has ? "#8fcf6a" : open ? "#f3e6d2" : "#6f5e48";
      ctx.font = `${Math.round(11 * this.zoom)}px "Segoe UI", sans-serif`;
      const label = (has ? "✓ " : "") + def.name;
      ctx.fillText(
        fit(ctx, label, w - 16 * this.zoom),
        x + 13 * this.zoom,
        y + h / 2 + 4 * this.zoom,
      );
    }

    this.renderInspect(k, target);
  }

  /** Era column headers, with the current era highlighted. */
  private drawEraHeaders(ctx: CanvasRenderingContext2D, current: Era): void {
    ctx.textAlign = "left";
    ctx.font = `bold ${Math.round(11 * this.zoom)}px "Segoe UI", sans-serif`;
    ERAS.forEach((era, i) => {
      const x = this.screenX(PAD_X + i * COL_W);
      ctx.fillStyle = era === current ? "#ffb454" : "#c2ad93";
      ctx.fillText(era, x, this.screenY(8));
    });
  }

  private renderInspect(
    k: GameController["sim"]["state"]["knowledge"],
    target: TechId | null,
  ): void {
    const box = this.host.querySelector('[data-el="inspect"]') as HTMLElement;
    if (this.inspectId === null) {
      box.innerHTML = "Click a tech to inspect.";
      return;
    }
    const def = TECH_TREE[this.inspectId];
    const has = k.has(this.inspectId);
    const open = k.isUnlocked(this.inspectId);
    const status = has
      ? "Known"
      : this.inspectId === target
        ? "Researching…"
        : open
          ? "Available"
          : "Locked";
    const pct = Math.round(Math.min(1, k.progress[this.inspectId] / def.cost) * 100);
    const prereqs = def.prereqs.length
      ? def.prereqs
          .map((p) => `<span class="${k.has(p) ? "pq-ok" : "pq-no"}">${k.has(p) ? "✓" : "✗"} ${TECH_TREE[p].name}</span>`)
          .join(" ")
      : '<span class="dim">none</span>';
    box.innerHTML = `
      <div class="gi-h">${def.name}</div>
      <div class="gi-meta">${def.era} · ${def.category} · <b>${status}</b></div>
      ${has ? "" : `<div class="gi-prog">research ${pct}% of ${def.cost}</div>`}
      <div class="gi-pre">Prereqs: ${prereqs}</div>
      <div class="gi-blurb">${def.blurb}</div>`;
  }
}

/** Place every tech: x by era column, y stacked within its era (TECH_ORDER). */
function layoutTechs(): GraphNode[] {
  const nodes: GraphNode[] = [];
  for (const era of ERAS) {
    const techs = TECH_ORDER.filter((t) => TECH_TREE[t].era === era);
    const colX = PAD_X + ERAS.indexOf(era) * COL_W;
    techs.forEach((id, i) => {
      nodes.push({ id, x: colX, y: PAD_Y + i * ROW_H });
    });
  }
  return nodes;
}

/** Truncate `text` with an ellipsis so it fits within `maxW` px in the given ctx. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
