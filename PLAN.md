# Zhan-Shui (斬山水) — Base Implementation Plan

## >>> INSTRUCTIONS FOR CLAUDE CODE (read first) <<<

**Build ONLY Phase 0 (Section 4), then stop.** Do not implement the real generator (Section 6), the real abilities or element behaviors (Section 7), or the integration (Section 8). Those are separate branches owned by two different people. Leave them as the stubs Section 4 describes.

Phase 0 also includes creating a root `CLAUDE.md` containing:
- The ownership table (A owns `src/gen/` and `src/pages/generator.ts`; B owns `src/sim/` and `src/pages/sandbox.ts`; `src/core/` is a shared contract).
- The rule that `src/core/` changes need a heads-up to the other person and must be small PRs.
- The determinism rule from Section 9.
- The policy that shan-shui-inf is **reference reading only: no code is copied, vendored or imported** (Section 11).
- The append-only rule for element ids.
- How to run each page and the tests.

When Phase 0 is done, verify the "Done when" line in Section 4, commit, and report what you verified. **Section 12 (modularity rules) is binding for Phase 0:** build the registries, auto-discovery, event bus and import-boundary check it describes, so that adding an element, ability, goal, level, param or render layer later means adding one file, not editing shared code. Sections 5 to 11 are reference material for the two branches, so read them for context but do not build them.

---

Goal of this plan: scaffold a shared foundation so **Person A (generator + scanner)** and **Person B (abilities + effects)** can branch and work independently, each with their own test page, without stepping on each other.

Stack: **Vite + TypeScript, no UI framework, Canvas 2D**, Vitest for tests. Multi-page Vite app.

---

## 1. Core idea: the grid is the source of truth

Instead of a vector painting with a canvas mask on top, the painting lives in a **Noita-style cell grid**. Every cell is a tiny simulated object with an element tag, and every visible mark (mountain, tree, water, fire, ink splatter) is made of cells.

Why this works for us:
- **Slash** = set cells to EMPTY (plus a CUT flag). No `destination-out` masking needed.
- **Water routing into grooves** falls out of ordinary cell physics. No special-case code.
- **Win-condition scanning** reads the actual cells, which is exactly the "Data Hack" from the design doc. The scan always matches what the player sees.
- **Fire/water/null/push** are all just rules over cells, so Person B works against one data structure.

A "stroke" is a **group of cells sharing an `owner` id** (e.g. one tree, one mountain ridge). The cell is the atom; the stroke is for bookkeeping and scoring.

Grid size: the source painting is a wide scroll (the reference painting's viewport is 3000×800 units, about 3.75:1), so use a **wide, short grid** such as **960×256** (~245k cells), not 16:9. Dimensions are a per-level `LevelDims {w, h}` passed into `World`, not global constants (wherever this plan says `W`/`H`, read `LevelDims`). Typed arrays make this cheap; add dirty-chunk skipping later (most cells are static rock). The grid is for physics and scanning only; Section 3.8 explains how the visuals stay pretty.

---

## 2. Repo layout and ownership

```
/
├─ index.html              # game shell (stub for now, integration later)
├─ generator.html          # Person A test canvas
├─ sandbox.html            # Person B particle sandbox
├─ src/
│  ├─ core/                # SHARED CONTRACT. Frozen after Phase 0. Changes via small PRs only.
│  │   ├─ constants.ts     # W, H, TICK_HZ
│  │   ├─ elements.ts      # element id enum (append-only) + ELEMENTS table
│  │   ├─ world.ts         # World class (typed arrays + accessors)
│  │   ├─ rng.ts           # seeded RNG (mulberry32)
│  │   ├─ noise.ts         # our own seeded fractal noise (used by generator features)
│  │   ├─ events.ts        # tiny event bus (cut, ignite, etc.)
│  │   ├─ blueprint.ts     # Blueprint + Registry types
│  │   ├─ params.ts        # GenParams type + defaults
│  │   ├─ clock.ts         # fixed-timestep loop
│  │   ├─ render.ts        # World -> ImageData -> canvas
│  │   └─ replay.ts        # ActionLog types + recorder + player
│  ├─ gen/                 # PERSON A
│  │   ├─ generate.ts      # (seed, params) -> Blueprint
│  │   ├─ features/        # generator features: mountains, trees, water... (original code, inspired by shan-shui-inf)
│  │   ├─ frontier.ts      # reveals blueprint columns into World over ticks
│  │   ├─ scan.ts          # heightAt(), scan()
│  │   └─ goals.ts         # goal predicates evaluated against scan()
│  ├─ sim/                 # PERSON B
│  │   ├─ step.ts          # World.step(): runs element behaviors
│  │   ├─ behaviors/       # one file per element (water.ts, fire.ts, ...)
│  │   └─ abilities/       # slash.ts, fire.ts, water.ts, null.ts, push.ts
│  ├─ pages/
│  │   ├─ generator.ts     # A's page logic
│  │   ├─ sandbox.ts       # B's page logic
│  │   └─ game.ts          # integration, later
│  └─ levels/              # level definitions (poem + params + goals), shared, later
└─ tests/
```

Rule: A touches `gen/` and `pages/generator.ts`. B touches `sim/` and `pages/sandbox.ts`. Anything in `core/` goes through a quick sync between you two.

---

## 3. Core contract (build this first, together)

### 3.1 Elements (`core/elements.ts`)

Append-only ids so branches never collide. Reserve ranges.

```ts
export const enum El {
  EMPTY = 0,
  ROCK = 1,     // mountain ink. static, solid
  TREE = 2,     // static, solid, flammable
  WATER = 3,    // liquid
  FIRE = 4,     // short-lived, rises, ignites neighbors
  SMOKE = 5,    // gas, decorative
  ASH = 6,      // powder, left behind by burnt trees
  SPLAT = 7,    // flying ink droplet (ballistic), becomes STAIN
  STAIN = 8,    // settled ink splatter. visual only, NOT solid for scanning
  // 9-31 reserved for B, 32-63 reserved for A, 64+ future (mist, hut, bridge, bird...)
}

export type Kind = 'empty' | 'static' | 'powder' | 'liquid' | 'gas' | 'projectile';

export interface ElementDef {
  id: El;
  name: string;
  kind: Kind;
  density: number;        // for displacement (water sinks under... nothing yet, but needed for mist later)
  flammability: number;   // 0..1 chance per tick to ignite when adjacent to fire
  solidForScan: boolean;  // counts toward heightAt()
  color: (cell: CellView) => number; // packed RGBA, may use aux/owner for variation
}
export const ELEMENTS: ElementDef[] = [...]; // indexed by id
```

Behaviors (update rules) are **not** in this file. They are registered by B in `sim/behaviors/` via `registerBehavior(El.WATER, fn)`. Core ships with no-op behaviors so A's page runs a static world.

### 3.2 World (`core/world.ts`)

Structure-of-arrays for speed and easy hashing/replay.

```ts
export class World {
  readonly w = W; readonly h = H;
  tick = 0;
  rng: Rng;                       // ALL randomness in the sim goes through this
  params: GenParams;              // gravity etc. readable by behaviors

  el:    Uint8Array;   // element id per cell
  life:  Uint8Array;   // countdown (fire lifetime, etc.)
  aux:   Uint8Array;   // element-specific (ink wetness, water pressure, shade variation)
  vx:    Int8Array;    // velocity, cells/tick (used by SPLAT, push)
  vy:    Int8Array;
  owner: Uint16Array;  // stroke id (0 = none). Links cell -> Registry entry
  flags: Uint8Array;   // bit0 UPDATED_THIS_TICK, bit1 CUT (scar), bit2 GENERATED

  idx(x, y): number;  inBounds(x, y): boolean;
  get(x, y): El;      set(x, y, el, opts?): void;   // set clears life/vel unless opts given
  swap(x1, y1, x2, y2): void;
  isEmpty(x, y): boolean;
  clearRect / clearCircle helpers;
  hash(): number;                  // for determinism tests
  events: EventBus;                // set() on a solid cell -> EMPTY emits 'cut' if flagged by slash
}
```

### 3.3 Fixed-timestep clock (`core/clock.ts`)

Sim runs at a fixed `TICK_HZ = 60` with an accumulator, independent of render rate. Pause / single-step / speed multiplier supported (both sandboxes need them). **Nothing in the sim may read wall-clock time or `Math.random`.** This is what makes replay work.

### 3.4 Blueprint + Registry (`core/blueprint.ts`)

This is the **A to B handoff contract**.

```ts
export interface Blueprint {
  seed: number; params: GenParams;
  w: number; h: number;
  el: Uint8Array;        // intended element per cell (fully generated, whole scroll)
  owner: Uint16Array;
  registry: Registry;
  draw: DrawCmd[];       // vector draw commands for the art layer (empty in Phase 0 stub)
}

export interface DrawCmd {
  pts: [number, number][];                 // in cell coordinates
  fill?: string; stroke?: string;          // rgba strings
  width?: number; category: 'mountain' | 'tree' | 'rock' | 'water' | 'structure';
}
export interface Registry {
  strokes: Map<number, StrokeInfo>;      // ownerId -> info
  waterSources: { x: number; y: number; rate: number }[];
}
export interface StrokeInfo {
  id: number; kind: 'mountain' | 'tree' | 'rock';
  bbox: [x0, y0, x1, y1]; anchor: [x, y];
}
```

`generate(seed, params)` is a **pure function**: same inputs, same Blueprint. It rasterizes the whole painting up front.

### 3.5 Frontier reveal (`gen/frontier.ts`)

The "painting draws itself left to right" effect is a **separate step** from generation:
- Each tick, `frontier` advances `columnsPerTick` columns and copies those Blueprint columns into the World.
- **Respect the cut mask:** if a World cell has the CUT flag (player slashed ahead of the frontier), the reveal skips it. This gives the "algorithm keeps drawing but the cut pixels stay erased" behavior.
- Water sources in the registry become active once the frontier passes their x.
- Draw a bright "brush head" at the frontier column for feel.

This keeps A's generator testable (pure, instant) and gives you a reveal system that abilities can interact with mid-paint.

### 3.6 Abilities + action log (`core/replay.ts`)

```ts
export interface PointerSample { x: number; y: number; speed: number } // sim units, speed in cells/tick
export interface ActionRecord { tick: number; ability: AbilityId; path: PointerSample[] }
export type ActionLog = ActionRecord[];

export interface Ability {
  id: AbilityId;
  begin(world: World, s: PointerSample): void;
  move(world: World, from: PointerSample, to: PointerSample): void;  // applies effect along segment
  end(world: World): void;
  tick?(world: World): void;                                          // ongoing effects (e.g. water stream)
  drawCursor?(g: CanvasRenderingContext2D): void;
}
```

Input handling converts mouse to sim coordinates and computes `speed` in cells per tick **at capture time** (stored in the log). Events are queued and applied at the start of the next tick, stamped with that tick. Replay re-feeds the log at the same ticks, so the same seed, params and log give the same final World hash.

### 3.7 Scan API (shared shape, A implements)

```ts
export function heightAt(world: World, x: number): number;  // height of topmost solidForScan cell, 0 if none
export interface ScanResult {
  heights: Int16Array;                       // per column
  peaks: { x: number; h: number; prominence: number }[];
  counts: { trees: number; tallMountains: number; shortMountains: number; waterfalls: number; water: number };
}
export function scan(world: World, thresholds?: ScanThresholds): ScanResult;
```

Scan reads **cells only**. Trees are counted by connected-component flood fill over TREE cells (so burnt trees stop counting). Waterfalls are vertical runs of WATER of length ≥ N. STAIN and SMOKE are not `solidForScan`.

---

## 4. Phase 0: shared scaffold (do this before branching)

Claude Code should build, in order:

1. Vite + TS + Vitest project, three HTML pages (`index`, `generator`, `sandbox`), multi-page config.
2. `core/` complete as specified above, with no-op behaviors and stub `generate()` that returns a flat ground line plus a few hardcoded rock bumps and trees (so both pages show something on day one).
3. `render.ts`: World to `ImageData` via `Uint32Array` view, paper-colored background, per-cell shade jitter from `aux`, scaled with CSS `image-rendering: pixelated`.
4. Stub `heightAt` / `scan` (correct but naive) in `gen/scan.ts`.
5. Tests: `world.hash()` stable for a given seed; stub generate is deterministic; clock steps exactly N ticks for N accumulator units.
6. README with the ownership table above, the "no Math.random / no wall-clock in sim" rule, and how to run each page.

**Done when:** `npm run dev` serves all three pages, `generator.html` shows the stub blueprint revealing left to right, `sandbox.html` shows the same world and a working brush that places ROCK, and `npm test` passes. Then branch: `feat/generator` and `feat/abilities`.

---

## 5. Test pages

### `generator.html` (Person A)
- Seed input + randomize button.
- Sliders: mountain height, ruggedness, spacing, tree density, gravity.
- **Instant preview** (full blueprint drawn at once) vs **playback** (frontier reveal with speed control).
- Overlays (toggles): `heightAt` curve, peak markers with prominence, registry markers (tree anchors, water sources), owner-id coloring.
- Live readout of `scan()` counts.
- "Copy params as JSON" button (so levels can be authored from good-looking results).

### `sandbox.html` (Person B)
- Element palette: click to paint any element with a brush (size slider).
- Ability bar: Slash, Fire, Water, Null, Push (stubs until implemented).
- Pause, single-step, speed (0.25x to 4x), tick counter, cell-count by element.
- Scene dropdown: built-in test scenes (steep mountain, valley, row of trees, flat plateau) **and** "load blueprint from generator" using seed + params. Built-in scenes are hand-built in `sim/scenes.ts` so B is never blocked on A.
- Debug overlays: flags (CUT edges highlighted), velocities, UPDATED parity.
- Record / replay buttons: record an action log, replay it, and show whether the final `world.hash()` matches.

---

## 6. Person A: generator + scanner

1. **Write original generator features** in `gen/features/`, using shan-shui-inf as *reference reading only* (nothing copied or vendored). **Read Section 11 first** for the techniques worth reimplementing and the policy.
2. **Rasterizer:** scanline polygon fill into `Blueprint.el` / `owner`, with per-stroke owner ids and registry entries (mountains, trees, water sources).
3. **Params:** wire height, ruggedness, spacing, tree density into the generator; `gravity` is passed through for B's behaviors to read.
4. **Reveal:** implement `frontier.ts` per section 3.5.
5. **Scanner:** real `heightAt`, peak detection with prominence, tall/short split by threshold, tree component counting, waterfall runs.
6. **Goals:** `goals.ts` predicates like `{ type: 'trees', op: '>=', n: 5 }` evaluated against `ScanResult`.
7. **Tests:** same seed gives identical blueprint hash; different seeds differ; scanner correct on hand-built worlds (e.g. one 40-high triangle gives one tall peak).

**Acceptance:** tweaking any slider visibly and predictably changes the painting; the scan readout matches what a human counts by eye on 10 random seeds.

---

## 7. Person B: abilities + effects

Shared simulation rules (`sim/step.ts`):
- Iterate **bottom to top**, alternating left-to-right / right-to-left each tick to avoid directional bias.
- Use the `UPDATED_THIS_TICK` flag so a cell moves at most once per tick.
- Behaviors get `(world, x, y)`; all randomness via `world.rng`.
- Gravity from `world.params.gravity` controls max fall steps per tick for WATER, ASH, SPLAT.

Elements and abilities:
1. **WATER:** fall straight down, else diagonal down, else spread laterally (dispersion rate). Water source emitters spawn cells at their `rate`. Grooves cut into slopes need no special code: water just falls into them.
2. **Slash:** along the segment, clear a **jagged, textured brush**: radius plus noise threshold per cell for rough edges. Set CUT flag on cleared cells. Emit `cut` events (future audio "scars"). Spawn **SPLAT** particles along the cut edge normal, with initial velocity scaled by mouse `speed`. SPLAT flies ballistically, then settles into **STAIN** (visual only, non-solid for scan).
3. **FIRE:** per-tick, burns down `life`, rises, each adjacent flammable cell ignites with probability = `flammability`. TREE burns to ASH/SMOKE. ROCK never burns. Water adjacent extinguishes fire (optional steam).
4. **Null:** clears cells in the brush, no splatter, no CUT flag.
5. **Neutral / liquify push (if time):** displace cells along the drag vector within the brush, conserving element counts.
6. **Action log:** record every ability use as `{tick, ability, path}`; replay produces a matching `world.hash()`.

**Acceptance:** in the sandbox, slashing a diagonal groove into a slope and dropping water diverts the water into the groove; fire spreads through a row of trees and stops at rock; a recorded session replays to the same hash.

---

## 8. Integration (later, after both branches land)

`pages/game.ts` pipeline per level:
1. Load level (poem, params, goals).
2. Player tunes params, UI previews via `generate()` instantly.
3. Press **Paint**: `frontier` starts revealing while abilities are live; player has an action budget per round (count `begin()` calls).
4. When frontier reaches the right edge and the sim settles (no active changes for N ticks), run `scan()` and evaluate goals.
5. Win: submit to gallery (store final grid as PNG + `ActionLog` + seed/params). Fail: burn-up restart animation.

Audio and gallery hook points are already in place: audio reads `heightAt` / peaks plus `cut` events (scars trigger a sharp plucked note); the gallery stores seed + params + action log.

---

## 9. Conventions and gotchas

- **Determinism rule:** no `Math.random`, `Date.now`, or `performance.now` inside `core/`, `gen/`, or `sim/`. Lint for it. All randomness comes from the seeded RNG (`core/rng.ts`) and all noise from our own seeded noise (`core/noise.ts`). No exceptions, since no third-party code is vendored.
- **Element ids are append-only.** Never renumber.
- **Perf:** typed arrays only in the hot loop, no per-cell objects, no allocations per tick. One `putImageData` per frame.
- **Fidelity risk:** a cell grid is chunkier than shan-shui-inf's delicate vector strokes. Mitigation: per-cell shade jitter, a soft-edge render pass, and a higher grid resolution if needed. Alternative if the look is unacceptable: keep a vector render layer for looks and use the grid only for physics and scanning (more work, so decide early).
- **Commit etiquette:** rebase on `main` often, keep `core/` PRs tiny and announce them to each other.

---

## 10. Open decisions to settle at kickoff

1. Grid resolution: 960×256 (default, wide scroll) vs larger if the look needs it.
2. Hybrid rendering (grid for physics, original ink art as the visual layer, Section 3.8) is now the **recommended default**, replacing the "Fidelity risk" bullet in Section 9. Confirm or veto.
3. Action budget per round: counted per ability use or per ink/length spent?
4. Exact tall/short mountain thresholds (relative to canvas height).
5. Units-to-cells scale for the generator (the reference painting is ~3000×800 units; trees are 10 to 100 units tall, so pick a scale where a tree is at least ~6 cells).

---

## 3.8 Rendering: hybrid by default

The repo's look comes from semi-transparent grey textured strokes, white "occluder" fills that hide things behind them, and `mix-blend-mode: multiply`. None of that survives being quantized to cells. So:

- `Blueprint` gains an optional `art` layer: the blueprint's `draw` commands (Section 11) pre-rendered once to an offscreen canvas at 3 to 4x grid resolution using Canvas 2D (same rgba fills and strokes).
- Each frame the renderer draws `art`, **masked by cell occupancy**: where a solid cell (ROCK/TREE) became EMPTY (slashed, burnt), the art is erased there. This is the original "destination-out" idea, but driven by the grid.
- Dynamic elements (WATER, FIRE, SMOKE, ASH, SPLAT, STAIN) are drawn directly from cells on top, in ink-wash colors.
- Frontier reveal clips `art` to x <= frontier.
- `core/render.ts` exposes an `ArtLayer` hook; the generator page shows art, cells, or both.

Physics, scanning and replay are unaffected: they only ever read cells.

---

## 11. Reference: shan-shui-inf (inspiration only, no code copied)

**Policy.** The repo (https://github.com/LingDong-/shan-shui-inf) is given to the AI as **reference reading**. Nothing is copied, vendored or imported. All generator code is original, lives in `gen/features/`, and targets our architecture (cells + `DrawCmd`s, not SVG). Instruction to the AI: *read the repo to understand the techniques, then design and write your own implementation from scratch. Do not paste or transliterate its functions.* The project is MIT licensed; if any output ends up near-verbatim it must carry the license notice, so keep the implementation structurally our own. Either way, credit shan-shui-inf in the README, in-game credits and the hackathon submission as the inspiration.

**What the repo is (verified).** A single `index.html` of inline scripts that generates an infinite scrolling landscape as **SVG strings**. It overrides `Math.random` globally, uses a p5-style Perlin noise, and has no rivers or waterfalls (`water()` only draws ripple strokes). So: the *ideas* transfer, the *code shape* does not, and water gameplay is entirely ours.

**Techniques worth reimplementing (read these parts of the repo)**
- **Mountain (`Mount.mountain`):** a stack of about 10 layers of about 50 points. Across x in [-pi/2, pi/2], height = cos envelope x fractal noise x `hei`; each deeper layer shrinks and shifts. **Layer 0 is the silhouette**, which for us is simply a heightfield `h(x)`. That gives a solid ROCK body and `heightAt` almost for free.
- **Mountain variants:** `flatMount` (clamped top for plateaus), `distMount` (long low background ridges), `rock` (small boulders).
- **Planner (`mountplanner`):** place peaks where noise has local maxima, enforce a minimum spacing with a coverage array, fill gaps with flat mountains, add distant ridges. This is where **spacing** comes from.
- **Vegetation (`vegetate` inside `mountain`):** candidate points on the mountain's point grid, kept where a noise threshold passes (cubed or fourth-powered noise gives sparse clusters), tree height scaled by position on the slope, a neighbor-count "proof rule" for clustering, different species at rim, top, middle and base. This is where **tree density** comes from.
- **Trees (`Tree.tree01..08`):** trunk as two noisy lines, foliage as noisy elongated blobs, recursive branching for big trees. Mimic the *look* with our own simplified shapes.
- **Ink look (`stroke`, `texture`, `blob`):** variable-width brush strokes (sine width profile plus noise), many thin texture strokes across the mountain layers, semi-transparent greys, white fills used to occlude what is behind. This is what makes it read as ink painting. It belongs in the **art layer**, not in cells (Section 3.8).
- **Noise:** Perlin with octaves and falloff. **Ruggedness** = octaves and falloff.

**Our implementation requirements**
- `core/noise.ts`: our own seeded fractal noise (value or Perlin), plus `core/rng.ts` (mulberry32). Everything deterministic.
- Each generator feature writes **both** physics cells (`el`, `owner`, registry) **and** `DrawCmd[]` (`blueprint.draw`) for the art layer. The `art` layer renders `draw` with Canvas 2D (Section 3.8).
- Build order inside Person A's track, so a demo is always possible: (1) heightfield mountains as ROCK plus flat ink fill; (2) planner for spacing; (3) simple trees as TREE cells plus art; (4) water sources and pools; (5) ink texture strokes and shading polish.

**Knob mapping (ours, inspired by the reference)**

| Game param | Our meaning |
|---|---|
| Mountain height | amplitude of the mountain heightfield |
| Ruggedness | noise octaves and falloff |
| Spacing | planner min distance / coverage |
| Tree density | vegetation noise threshold |
| Gravity | read by Person B's behaviors |

**Ours to invent (Person A):** water sources (springs near peaks), pools in valleys, and anything goals need that the reference lacks. The reference's huts and pagodas are a good model for the "pavilion" future element.

---

## 12. Modularity rules (hackathon-proofing)

Design goal: **any new idea is one new file plus zero edits to shared code.** Requirements will change at 3am; the structure should absorb it.

### 12.1 Dependency direction (enforced)

```
core  <--  gen
core  <--  sim
core  <--  audio, levels
pages  -->  everything
```

- `gen/` and `sim/` **never import each other.** They communicate only through `core/` types: `World`, `Blueprint`, `EventBus`, registries.
- `core/` imports nothing from the other folders.
- Enforce with `dependency-cruiser` or ESLint `no-restricted-imports`, run in `npm test`. A violation fails the build, so boundaries cannot rot silently.

### 12.2 Registries with auto-discovery

Each extension point has a registry in `core/`. Files register themselves; Vite's `import.meta.glob` loads every file in the folder, so **dropping a file in the folder is the whole integration.**

| Extension point | Folder | Register call | Appears automatically in |
|---|---|---|---|
| Elements | `sim/elements/*.ts` | `registerElement({id, name, kind, color, ...})` | sandbox palette, renderer, scanner flags |
| Behaviors | `sim/behaviors/*.ts` | `registerBehavior(El.X, fn)` | sim step |
| Abilities | `sim/abilities/*.ts` | `registerAbility({id, name, icon, ...})` | sandbox ability bar, game action bar |
| Generator features | `gen/features/*.ts` (mountain, trees, water, huts, mist...) | `registerFeature({name, order, run(ctx)})` | the generate pipeline, generator page toggles |
| Scan metrics | `gen/metrics/*.ts` | `registerMetric(name, (world) => number)` | `ScanResult.counts`, goal predicates, readout |
| Goal types | `levels/goals/*.ts` | `registerGoal(type, (scan, args) => {pass, progress})` | level files, HUD |
| Render layers | `core/layers/*.ts` | `registerLayer({name, order, draw})` | both pages, with debug toggles |
| Audio listeners | `audio/*.ts` | subscribe to the event bus | n/a |

Element ids: the core enum stays append-only. Extension elements declare an explicit id in their reserved range, and `registerElement` **throws at startup on a duplicate id or name**, so collisions surface in seconds, not at integration.

### 12.3 Everything tunable is data, not code

- **Param schema:** `core/params.ts` defines params as data: `{ key, label, min, max, step, default }`. Both pages **generate their sliders from the schema**, so adding a param is one schema line plus reading it where it is used.
- **Levels are plain data files** in `levels/*.ts`: `{ id, poem, dims, seed, params (with locked/visible flags), goals: [{type, ...args}], actionBudget, featuresEnabled }`. A new level never touches engine code.
- **Ability tunables** (brush radius, splatter count, fire spread chance) are exported constants objects per ability, editable live in the sandbox via a debug panel, so you can tweak feel without rebuilding.

### 12.4 Pipelines are lists of small stages

- `generate()` = ordered list of **features**, each `run(ctx: {rng, params, blueprint, registry})`. Features are individually toggleable (`config.features`), so the mountain generation, the water placement and the hut placement can ship or be cut independently.
- Sim step = ordered **behaviors by element**, plus optional **global passes** (`registerPass(order, fn)`), e.g. water-source emitters, fire spread, stain fade.
- Scoring = **metrics** feed **goals**; neither knows about the other.
- Rendering = a **stack of layers** (paper, art, cells, debug overlays, cursor), each independently on or off.

### 12.5 Communicate through events, not calls

The `core/events.ts` bus carries typed events: `cut`, `ignite`, `burn`, `splash`, `levelStart`, `frontierAdvance`, `scanComplete`, `levelWin`, `levelFail`. Audio, screen-shake, particles and scoring **subscribe**; the sim only emits. Adding a sound or effect never edits the sim.

### 12.6 Kill switches and escape hatches

- `core/config.ts` holds feature flags (`audio`, `artLayer`, `splatter`, `fireSpread`, ...). Anything flaky at hour 20 gets switched off with one line instead of a revert.
- Every non-essential system must be **removable without breaking the build or the demo path**: delete the file and the registry simply has one fewer entry.
- Keep the **must-have path** (generate, reveal, slash, scan, win) free of optional modules: it may not import from any optional feature.

### 12.7 Replace-in-place friendliness

- Public APIs are small interfaces in `core/` (`Generator`, `Ability`, `Behavior`, `Metric`, `Goal`, `Layer`). An implementation can be rewritten wholesale, e.g. swap the mountain generator for something simpler, without touching callers.
- Tests target interfaces and determinism hashes (same seed gives same hash), not internals, so internals can be rewritten freely.

### 12.8 Phase 0 acceptance for modularity

Phase 0 is not done until these pass:
1. A test file registers a dummy element, ability, metric, goal and layer **by dropping files into the folders only**, and all of them show up in the sandbox/generator UI and in the registries.
2. The import-boundary check fails when a `gen/` file imports from `sim/` (prove it with a deliberate bad import in a test fixture).
3. A duplicate element id throws at startup.
4. Adding a param to the schema makes a slider appear on both pages with no other edits.
5. Disabling a feature flag removes that feature from the pipeline with no errors.
