import type { GameController } from "../game/controller.js";
import { REGIONS, BIOME_PROFILE, regionById, type Biome } from "../sim/index.js";
import { dispositionStyle } from "./diplomacy.js";

const BIOME_COLOR: Record<Biome, string> = {
  tundra: "#cfe0e8",
  forest: "#4f8c3f",
  river: "#5b9bd5",
  grassland: "#b7c95e",
  desert: "#e0c87e",
  coast: "#6fc0c0",
};

/** Full-screen region map: see the world, weigh a migration, commit to it. */
export class MapView {
  private host: HTMLElement;
  private ctrl: GameController;
  private selected: string | null = null;
  visible = false;

  constructor(host: HTMLElement, ctrl: GameController) {
    this.host = host;
    this.ctrl = ctrl;
    this.build();
  }

  private build(): void {
    this.host.className = "modal hidden mapmodal";
    this.host.innerHTML = `
      <div class="modal-card map-card">
        <h3>The Known World <span class="dim">— migrate to reshape your evolution</span></h3>
        <div class="map-wrap">
          <svg viewBox="0 0 100 72" class="mapsvg" data-el="svg"></svg>
        </div>
        <div class="map-info" data-el="info">Select a region to consider the journey.</div>
        <div class="modal-actions">
          <button data-act="migrate" class="primary" disabled>Migrate</button>
          <button data-act="map-close">Close</button>
        </div>
      </div>`;
    this.host.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const node = t.closest("[data-region]") as HTMLElement | null;
      if (node) {
        this.selected = node.dataset.region!;
        this.render();
        return;
      }
      const btn = t.closest("button") as HTMLButtonElement | null;
      if (!btn) return;
      if (btn.dataset.act === "map-close") this.hide();
      if (btn.dataset.act === "migrate" && this.selected) {
        this.ctrl.sim.migrate(this.selected);
        this.selected = null;
        this.hide();
      }
    });
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }
  show(): void {
    this.visible = true;
    this.selected = null;
    this.ctrl.paused = true;
    this.host.classList.remove("hidden");
    this.render();
  }
  hide(): void {
    this.visible = false;
    this.host.classList.add("hidden");
  }

  render(): void {
    if (!this.visible) return;
    const cur = this.ctrl.sim.state.region;
    const svg = this.host.querySelector('[data-el="svg"]') as SVGElement;

    // edges from the current region to all others
    let edges = "";
    const here = regionById(cur);
    for (const r of REGIONS) {
      if (r.id === cur) continue;
      edges += `<line x1="${here.x * 100}" y1="${here.y * 72}" x2="${r.x * 100}" y2="${r.y * 72}" class="mapedge"/>`;
    }
    const nodes = REGIONS.map((r) => {
      const cls = r.id === cur ? "here" : r.id === this.selected ? "sel" : "";
      return `<g data-region="${r.id}" class="mapnode ${cls}" transform="translate(${r.x * 100},${r.y * 72})">
        <circle r="4.5" fill="${BIOME_COLOR[r.biome]}" />
        <text y="-6">${r.name}</text>
      </g>`;
    }).join("");
    // Neighbour tribes: a disposition-coloured marker at each rival's home region.
    const rivals = this.ctrl.sim.state.rivals
      .map((rv) => {
        const reg = regionById(rv.homeRegion);
        const disp = dispositionStyle(rv.disposition);
        return `<g class="rivalmarker" data-disp="${disp.key}" transform="translate(${reg.x * 100 + 5},${reg.y * 72 - 5})">
          <circle r="2.4" fill="${disp.color}" />
          <title>${rv.name} — ${disp.label} (relations ${rv.relations.toFixed(2)})</title>
        </g>`;
      })
      .join("");
    svg.innerHTML = edges + nodes + rivals;

    const info = this.host.querySelector('[data-el="info"]') as HTMLElement;
    const btn = this.host.querySelector('[data-act="migrate"]') as HTMLButtonElement;
    if (!this.selected || this.selected === cur) {
      info.innerHTML =
        this.selected === cur
          ? `You are here: <b>${here.name}</b> — ${BIOME_PROFILE[here.biome].blurb}`
          : `You are in <b>${here.name}</b> (${here.biome}). Pick a region to consider migrating.`;
      btn.disabled = true;
      return;
    }
    const target = regionById(this.selected);
    const prof = BIOME_PROFILE[target.biome];
    const cost = this.ctrl.sim.migrationCost(this.selected);
    info.innerHTML = `
      <b>${target.name}</b> — ${target.biome}. ${prof.blurb}<br>
      Rewards <b>${prof.selectTrait}</b>. Journey: <b>${cost.food}</b> food,
      risk ~<b>${Math.round(cost.risk * 100)}%</b> per person.`;
    btn.disabled = false;
  }
}
