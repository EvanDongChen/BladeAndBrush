# Zhan-Shui (斬山水): notes for Claude Code

The full design is in [PLAN.md](PLAN.md). Phase 0 (the shared scaffold) is done. Work now happens on two branches, `feat/generator` (Person A) and `feat/abilities` (Person B).

## Ownership

| Area | Owner | Notes |
|---|---|---|
| `src/gen/`, `src/pages/generator.ts` | **Person A** | generator, frontier reveal, scanner, metrics |
| `src/sim/`, `src/pages/sandbox.ts` | **Person B** | step loop, behaviors, abilities, sim elements |
| `src/core/` | **shared contract** | changes need a heads-up to the other person and must be small PRs |
| `src/pages/bootstrap.ts`, `ui.ts`, `game.ts`, `style.css`, `src/levels/` | shared | integration comes later |

- Only edit the files your person owns. If a change needs `src/core/`, keep it as small as possible, tell the other person, and land it as its own small PR.

## Rules

- **Determinism:** no `Math.random`, `Date.now`, `performance.now` or `new Date()` inside `src/core/`, `src/gen/` or `src/sim/`. All randomness comes from the seeded RNG (`core/rng.ts`, or `world.rng` in the sim) and all noise from `core/noise.ts`. Sim time is `world.tick`. ESLint enforces this and runs in `npm test`. Pages may read the wall clock, e.g. to compute pointer speed at capture time; that value is stored in the action log.
- **Import boundaries** (enforced by ESLint in `npm test`): `core` imports nothing outside `core`. `gen` and `sim` never import each other; they talk only through `core` types (`World`, `Blueprint`, `EventBus`, registries). `levels` and `audio` import only `core`. `pages` may import everything.
- **Element ids are append-only.** Never renumber or reuse an id. Ranges: 0-8 built in, 9-31 Person B, 32-63 Person A, 64+ future. `registerElement` throws at startup on a duplicate id or name.
- **shan-shui-inf is reference reading only.** No code is copied, vendored or imported from https://github.com/LingDong-/shan-shui-inf. Read it to understand the techniques, then write original code that targets our architecture (cells plus `DrawCmd`s). Do not paste or transliterate its functions. It is credited in the README as the inspiration.
- **Perf:** typed arrays in hot loops, no per-cell objects, no allocations per tick, one `putImageData` per frame.
- Event listeners must never mutate the World, because that would break replay.

## Running

```sh
npm install
npm run dev        # http://localhost:5173/  (game shell)
                   # http://localhost:5173/generator.html  (Person A's test page)
                   # http://localhost:5173/sandbox.html    (Person B's test page)
npm test           # typecheck + lint (boundaries, determinism) + vitest
npm run test:watch # vitest only, watch mode
npm run build      # typecheck + production build to dist/
```

## Adding things: one new file, zero edits to shared code

Every file in these folders is auto-imported by `src/pages/bootstrap.ts` (`import.meta.glob`). Each file registers itself.

| To add a... | Drop a file in | That calls |
|---|---|---|
| element | `src/sim/elements/` (or `src/gen/elements/` for ids 32-63) | `registerElement({ id, name, kind, color, ... })` from `core/elements` |
| behavior | `src/sim/behaviors/` | `registerBehavior(El.X, fn)` or `registerPass({...})` from `core/behaviors` |
| ability | `src/sim/abilities/` | `registerAbility({ id, name, icon, begin, move, end })` from `core/abilities` |
| generator feature | `src/gen/features/` | `registerFeature({ name, order, run(ctx) })` from `core/features` |
| scan metric | `src/gen/metrics/` | `registerMetric(name, (world, ctx) => number)` from `core/scan` |
| goal type | `src/levels/goals/` | `registerGoal(type, (scan, args) => ({ pass, progress }))` from `core/goals` |
| level | `src/levels/` | `registerLevel({ id, poem, dims, seed, params, goals, actionBudget })` from `core/levels` |
| render layer | `src/core/layers/` | `registerLayer({ name, order, kind: 'pixels' or 'canvas', draw })` from `core/render` |
| glowing element | any file in `src/sim/elements/` | `registerGlow({ el, r, g, b, near, far, level? })` from `core/glow` (the glow layer does the rest) |
| creature (self-moving sprite) | `src/sim/behaviors/` + its element in `src/sim/elements/` | `defineCreature({ el, frames, variants, paint, think })` from `sim/creatures`; also registers the brush spawner |
| brush hooks for an element | its element file | `registerPaintAux(el, fn)` / `registerSpawner(el, fn, spacing)` from `sim/spawn` |
| param (slider) | one line in `src/core/params.ts` | `registerParam({ key, label, min, max, step, default })` |
| audio and FX | `src/audio/` | `world.events.on('cut', ...)` |
| music voice, effect or painting sound | `src/audio/synth.ts`, `song.ts` | see Audio below |

Registries throw on duplicate keys. Kill switches are in `src/core/config.ts`: `flags` for anything that names a `flag`, and `featureToggles` for generator features.

## Conventions

- Grid: `idx = y * w + x`, with **y = 0 at the top**. Dimensions come from `LevelDims` (default 960×256 in `core/constants.ts`), never from globals.
- Per-tick order on the pages: `driver.apply(world)` (queued input or replay), then `frontier.advance(world)` on the generator page, then `step(world)`. `step` advances `world.tick`.
- Abilities receive `args` (e.g. `radius`, `el`). Args are recorded in the action log, so replays reproduce them.
- `World.set()` clears life, velocity and owner unless they are given. It keeps aux and flags. Pass `{ cut: true }` to leave a CUT scar and emit `cut`.
- Out-of-bounds `world.get()` returns ROCK, so the grid edges act as walls.
- Stubs are marked `PHASE 0 STUB`; replace them on your branch.
- Element colors can animate: `CellView.tick` is the world tick (rendering only). Water shimmers and fire is colored by remaining life in `core/elements.ts`; use `hash3`, `SIN256` and `scaled` from there for your own.
- Creatures are cells: one anchor cell holds the state (vx = facing, vy = frame, owner = variant, life = AI byte) and every other cell points back at it through vx/vy. A creature that loses a cell dies (burns if the missing cell is burning, otherwise bursts into SPLAT ink). They only move through empty space and gas. See the header of `src/sim/creatures.ts`.
- Per-fuel burn behavior (burn life, ash chance, spark rate) lives in `src/sim/behaviors/fire.ts`; add a fuel there when you add a flammable element that should burn differently from wood.
- Tests target interfaces and determinism hashes, not internals. `tests/discovery.test.ts` writes temporary `zz_test_dummy.ts` files into `src/` and deletes them afterwards. Test files run one at a time for that reason.

## Audio

`src/audio/` imports only `core`. It reads the World and never changes it.

- `profile.ts` turns any grid (a World, or a Blueprint before it is revealed) into a `Landscape`: surface height in 32 slices, peaks, dips, and how much water, fire, trees, birds and people there are.
- `theory.ts` has the five pentatonic modes (宮商角徵羽). The painting picks the mode (water gives 羽, fire 徵, rugged 商, tall 角, else 宮) and the seed picks the tonic.
- `song.ts` is the painting's own song, composed from the Blueprint when it is generated: an intro, one beat per slice across the scroll, then a cadence home (about 35 s). The mode picks the lead instrument (the seed chooses between two), and what the generator placed plays where it stands (village → woodblock, birds → dizi trill, moon → guqin harmonics, spring → falling guzheng sweep, trees → light plucks). Map a new stroke kind to a sound in its per-slice block.
- `composer.ts` is the endless version that follows the live World after the song ends. Height sets pitch, peaks get a dizi note, dips a low guqin note, steep slopes a glide. Both composers are pure and deterministic, so test them in `tests/audio-*.test.ts`.
- `strings.ts` renders plucked strings (guzheng, pipa, guqin) by Karplus-Strong into Float32Arrays; pure and testable.
- `synth.ts` holds the voices: the sampled strings (with slide, 按音 bend and vibrato on `detune`), guqin harmonics, dizi, erhu, chime, woodblock, drum, gong, and the effect sounds. Add a voice to `Voice` in `composer.ts`, its seat in `PAN` in `engine.ts`, and a case in `playNote`.
- `engine.ts` owns the AudioContext. `audio.attach(world, bp)` composes the new painting's song and plays it from the start (or from the first gesture), then hands over to the endless composer, which re-reads the world every two beats. It turns `cut`, `lineFire`, `impact`, `ignite`, `splash`, `levelWin` and `levelFail` events into sounds. Pages call `audio.attach(world, bp)` whenever they generate a new painting and `audio.detach()` on cleanup, and add `soundToggle()` from `ui.ts` to the header. `audio.playhead()` gives where the music is on the scroll (0..1) for drawing.
- Browsers block sound until a gesture, so call `audio.armOnGesture()` once per page. Mute is saved under `bb-sound` in localStorage.
- Every file in `src/audio/` is auto-imported by `bootstrap.ts`, so nothing there may run Web Audio code at import time.
