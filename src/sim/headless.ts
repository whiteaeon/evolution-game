/**
 * Headless driver: runs the pure sim with no renderer at all, printing an era
 * report as the tribe climbs from the Paleolithic to the Modern era.
 *   npm run sim
 */
import { Simulation } from "./simulation.js";
import { TRAITS } from "./types.js";

const sim = new Simulation({ seed: 42, startingPopulation: 12 });

const MAX_TICKS = 4000;
let lastEra = "";

console.log("year  pop  gen  era            " + TRAITS.map((t) => t.slice(0, 4)).join("  "));
const report = () => {
  const avg = sim.traitAverages();
  const traitStr = TRAITS.map((t) => avg.traits[t].toFixed(2)).join("  ");
  console.log(
    `${String(sim.state.tick).padStart(4)}  ${String(avg.count).padStart(3)}  ` +
      `${String(sim.state.generation).padStart(3)}  ${sim.state.era.padEnd(13)}  ${traitStr}`,
  );
};

for (let i = 1; i <= MAX_TICKS; i++) {
  // Proportional autopilot: feed the tribe first, always fund research.
  sim.autoAllocate({ gather: 4, hunt: 2, research: 3, cook: 1, build: 1 });
  // Auto-accept any interbreeding offer (the interactive game lets you choose).
  if (sim.state.pendingEncounter) sim.resolveEncounter(true);
  sim.tick();

  if (sim.state.era !== lastEra || i % 40 === 0) {
    lastEra = sim.state.era;
    report();
  }
  if (sim.state.won) {
    console.log(`\n🛰️  Reached the Information Age at year ${sim.state.tick}, generation ${sim.state.generation}!`);
    console.log(`   births=${sim.state.totals.births} deaths=${sim.state.totals.deaths} interbred=${sim.state.totals.interbred}`);
    break;
  }
  if (sim.living.length === 0) {
    console.log(`\n💀 The tribe died out at year ${sim.state.tick}.`);
    break;
  }
}
