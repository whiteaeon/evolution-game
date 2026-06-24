# Dawn of the Tribe

A cozy 2D **human-evolution** game. You guide a small hominin tribe across the
whole human story — from a handful of stone-age foragers in an ice-age tundra to a
connected **Information-Age** civilization — watching them evolve **biologically**
(heritable trait averages drift under survival pressure), **culturally**
(technology accumulates and outlives the individuals who discover it), and
**geographically** (where the tribe lives shapes what survives). Reaching the
**Information Age** wins.

Stardew-ish warm pixel aesthetic, drawn from public-domain (CC0) pixel-art packs
behind a texture-key indirection (see *Art* below).

---

## Run it

```bash
npm install
npm run dev        # Vite dev server → open the printed http://localhost:5173
```

Other scripts:

```bash
npm test           # 34 headless unit tests for the simulation (Vitest)
npm run sim        # run the pure sim with no renderer; prints an era-by-era report
npm run build      # typecheck (tsc --noEmit) + production build
```

### How to play
- Press **▶ Play**, pick a speed (1× / 2× / 4×).
- **Assign the tribe** to tasks (gather, hunt, cook, build, research). Feed the
  tribe first; spare hands fund research.
- Climb the **tech tree** (click an available tech to steer research). Eight
  capstone techs advance the era (Agriculture → Bronze Working → Iron Working →
  Engineering → Guilds → Steam Power → Electricity → **Computing**).
- Open the **🗺 Map** to migrate to another **region**. Each biome rewards a
  different trait and carries its own dangers — a real decision with a food cost
  and travel risk. You begin in the harsh tundra; greener lands await.
- When another people appears, decide whether to **interbreed** — their blood
  brings new strengths (Neanderthal grit, Denisovan resilience, Sapiens intellect).
- Open the **🌳 Family** tree to explore your lineage: pan, zoom, click anyone to
  inspect their traits, and climb generation by generation to the founders.
- Watch the **genome bars** and **population graph**, read the **Chronicle**, and
  watch the sprites **morph** era by era — body, posture, clothing and tools —
  from heavy-browed and stooped to fully modern.
- **Save / Load** any run; a finished run leaves a **legacy** that gives the next
  tribe a small head start. Reach the **Information Age** to win.

---

## Architecture: sim vs. render

The simulation is a **pure, deterministic, framework-agnostic** TypeScript engine
with **zero Phaser imports**. The renderer and DOM UI are thin views on top; they
share one object — the `GameController` — and read `sim.state`.

```
src/
  sim/                 ← pure engine (no DOM, no Phaser); fully unit-tested
    rng.ts             seeded mulberry32 RNG (+ get/setState for save-load)
    types.ts           traits, tasks, the 9 eras, the tech list, data-driven TechEffects
    genome.ts          Mendelian inheritance + per-gene mutation
    knowledge.ts       full tech tree, era capstones, effect aggregation, language chain
    regions.ts         the world map: regions + per-biome environment & selection profiles
    simulation.ts      tick loop, selection, interbreeding, migration, shelters, eras, save/load
    headless.ts        `npm run sim` driver (proves it runs with no renderer)
    *.test.ts          Vitest specs (see below)
  game/                ← Phaser render layer (reads sim state, never owns it)
    controller.ts      owns the Simulation; paces ticks; save/load; roguelite legacy
    legacy.ts          pure legacy/meta helpers + localStorage IO
    textures.ts        bakes CC0 art (biomes, shelters, animals…) + the hand-drawn era morph
    art-cc0-data.ts    generated: raw pixels of the CC0 source art (see Art below)
    palette.ts         colors
    MainScene.ts       biome tiles, decor, shelters, farms, animals, sprites, weather
  ui/                  ← DOM overlay (also reads sim state via the controller)
    overlay.ts         era track, goals, traits, graph, tech tree, tasks, modals, log
    map.ts             the region-map view + migration UI
    familytree.ts      the navigable, zoomable family tree (canvas)
    audio.ts           tiny WebAudio blips/chimes (off by default)
    style.css
  main.ts              wires Phaser + DOM UI to one shared GameController
```

Why this split: the model is the hard part and the part worth testing. The whole
game logic runs in `npm run sim` and in unit tests with **no browser**, and the
Phaser layer can be swapped without touching a line of simulation code. The
renderer only references **texture keys and `sim.state`** — so the art layer is a
single swap point (see *Art* below).

---

## The full arc — nine eras

Reaching the **Information Age** wins. Each era after the first is gated by a
capstone technology; the critical path runs through every era in turn.

| Era | Capstone | Sample techs | What changes |
| --- | --- | --- | --- |
| **Paleolithic** | *(start)* | stone tools, fire, gathering, hunting, cooking, gestures, burial, cave art, symbols | survive the cold; the first culture |
| **Neolithic** | Agriculture | pottery, animal domestication, weaving, calendar, spoken language | farms + herds; big food & capacity jump |
| **Bronze Age** | Bronze Working | the wheel, writing, irrigation, sailing | metals, records, new lands |
| **Iron Age** | Iron Working | masonry, currency, mathematics, medicine | towns, science, disease defense |
| **Classical** | Engineering | philosophy, republic, aqueducts | roads & law; learning compounds |
| **Medieval** | Guilds | universities, windmills, gunpowder, banking | scholarship, capital, the end of walls |
| **Industrial** | Steam Power | printing, machinery, sanitation | factories, cities, research explodes |
| **Modern** | Electricity | telegraph & radio, automobile | power & communication shrink the world |
| **Information** | Computing | electronics, vaccines, the Internet | **thinking machines — you win** |

Shelter follows the eras: **cave → hut → village → town → city**. The biome is now
set by the **region** you live in, not the era (see below).

The headless `npm run sim` autopilot (which never migrates — worst case) reaches
the Information Age around **year ~450–490, generation ~25–28**, growing from 12
founders to a population in the hundreds. Across 30 seeds it wins ~28/30 even
without ever leaving the tundra; migrating to friendlier biomes makes it easier
still.

---

## The model

### Genome & traits
Six heritable traits in `[0, 1]`: **strength, intelligence, dexterity,
coldTolerance, diseaseResistance, speech**. Inheritance is Mendelian crossover
(each gene copied from one parent) plus a small Gaussian mutation — with
`mutationRate = 0` every offspring gene is *exactly* a parent's allele
(testable), with mutation it drifts. Every individual records its parents
(`motherId`/`fatherId`), which is what the family tree reads.

### Selection → trait drift
Per tick (one year): workers **produce** → the tribe **consumes** → **mortality**
is rolled → an **event** may fire → a neighbouring people may **appear** →
survivors **reproduce**. Two forces move trait averages directionally:
differential **mortality** (cold kills the cold-intolerant; endemic disease kills
the susceptible) and fitness-weighted **reproduction** (both parents drawn by
environment-relevant fitness). So ice ages raise coldTolerance, recurring disease
raises diseaseResistance, and **cooked food + schooling raise intelligence**.

### Place shapes evolution — regions, biomes & migration
The world is a map of **regions**, each in a biome — **tundra, forest, river,
grassland, desert, coast**. The biome of your current region changes the *whole
environment*: ambient cold, food abundance, gather/hunt yields, disease and
predator pressure, carrying capacity, **and which trait reproduction rewards**.
The river breeds disease but selects for resistance; the tundra selects hard for
coldTolerance; the desert rewards thrifty dexterity; the coast rewards speech
(trade). **Migrating** (`migrate(regionId)`) is a real decision: it costs food and
the journey kills some — the frail and weak especially — but it resets which
pressures shape your lineage. Location is an evolutionary force, not scenery.

### Cumulative knowledge (culture) + data-driven effects
Discovered techs live in a `Knowledge` store **separate from individuals**, so
culture survives death. Every tech's gameplay impact is **pure data** in its
`effects` (food/research/build multipliers, warmth, capacity, disease defense,
intelligence pressure…); the sim aggregates them generically — no per-tech
conditionals. The **language chain** (grunts → gestures → symbols → speech →
writing → print) compounds research and cooperation. The aggregate research
multiplier is deliberately *compressed* (sub-linear) so the late eras stay
visible instead of collapsing into a single tick once the multipliers stack.

### Interbreeding
While archaic, the tribe meets Sapiens / Neanderthal / Denisovan bands.
Accepting injects archetype-leaning kin into the gene pool — a real jump in the
relevant trait averages plus fresh variance for selection to keep working. These
newcomers are roots in the family tree (tagged with their lineage).

### Determinism & save/load
Everything flows from one seeded RNG, so a run replays identically — which makes
the model testable and makes `serialize()` / `Simulation.load()` an exact resume
(RNG state, region, and full pedigree included). A finished run folds into a
persistent **legacy** that grants the next tribe a small, capped founder bonus.

---

## Tests (what's proven) — `npm test`, 34 specs

- **genome** — inheritance (zero-mutation ⇒ exact parental alleles; crossover;
  determinism) and mutation (drifts; clamped).
- **selection** — ice age raises coldTolerance, disease raises diseaseResistance,
  cooking raises intelligence vs. a no-cooking control (each pinned to an apt biome).
- **biome / migration** — the fever-ridden river selects diseaseResistance far
  more than the desert; the tundra raises coldTolerance; migration costs scale with
  distance, move the tribe and change the biome, spend food, and a long hungry
  journey kills more than a short well-fed one.
- **knowledge** — prerequisites, partial research, **culture persists after every
  discoverer dies**, era derived from capstones, language chain compounds effects.
- **family** — every non-founder has two existing, strictly-earlier-generation
  parents; ancestry walks terminate at founders with no cycles; interbreeding
  newcomers are parentless lineage-tagged roots.
- **mechanics** — interbreeding injects archetype-leaning kin and lifts the right
  trait; declining is a no-op; goals name the next capstone.
- **persistence** — save/load round-trips and **resumes the RNG identically**;
  the roguelite founder bonus gives a head start. Plus pure legacy-folding specs.
- **milestone** — the tree is researched and the era climbs all the way to the
  **Information Age**, through every capstone, deterministically.

---

## Art

The world art — **biome ground, decor (trees/bush/rock), structures (the
cave→hut→village→town→city ladder), animals, food and the hearth** — is sourced
from **public-domain (CC0)** pixel-art packs. The only hand-authored art is the
**hominin era-morph** (`textures.ts` `ensureHomininTexture`): a nine-stage human
that ages from archaic to modern with era clothing, headwear, held tool and
lineage skin tint — there is no CC0 equivalent for it, so it stays hand-drawn.

### Attribution

| Pack | Author | License | Used for |
| --- | --- | --- | --- |
| [Roguelike/RPG pack](https://kenney.nl/assets/roguelike-rpg-pack) | Kenney | CC0 1.0 | biome ground, trees/bush/rock, tents & buildings, farmland/crop, food, hearth |
| [Pixel Animals 16x16](https://opengameart.org/content/pixel-animals-16x16) | GrumpyDiamond | CC0 1.0 | cow, sheep |
| [Dog Sprites](https://opengameart.org/content/dog-sprites) | Shepardskin | CC0 1.0 | dog |

All three are [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
(public domain). The source files and their per-pack licences live in
`src/assets/cc0/` (see `src/assets/cc0/CREDITS.md`).

### How it's wired (the swap point held)

The renderer cannot decode PNGs synchronously at scene-create time, so a one-off
tool (`tools/extract-cc0-art.py`, requires Pillow) slices / recolours /
composites the CC0 sources into the final sprites and bakes their raw pixels into
`src/game/art-cc0-data.ts`. At runtime `textures.ts` blits that data into Phaser
canvas textures **under the same stable texture keys** the scene already used —
so **`MainScene.ts` did not change at all**, and re-skinning the game stays a
`textures.ts`-only swap. To regenerate after changing the mapping or sources:

```bash
python tools/extract-cc0-art.py --emit
```

---

## Notable decisions & limitations / future work

- **Lineage, not a character.** You shepherd a gene pool and a culture; individual
  hominins are disposable (but every one is remembered in the family tree).
- **Balance is tuned, not realistic.** All numbers live in the `BALANCE` block in
  `simulation.ts`, the biome profiles in `regions.ts`, and each tech's `effects` —
  game values, easy to retune. Later eras still accelerate (compounding research)
  to evoke the quickening pace of history, now damped so each era is visible.
- **Rendered sprites are capped** (40) for large populations; the simulated
  population is uncapped and shown in the stats/graph. The family-tree ancestor
  view caps drawn depth and lets you *climb* (re-focus on an ancestor) to go deeper.
- **Audio** is minimal synthesized blips/chimes (off by default), not a score.
- **Future work:** richer map play (fog of war,
  per-region resources you carry, simultaneous tribes); a descendant/whole-graph
  family view (today's view is ancestry-focused); deeper domestication
  (individual crops/animals); and richer, choice-driven event chains.
