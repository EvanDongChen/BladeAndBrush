import { describe, expect, it } from 'vitest';
import '../src/pages/bootstrap';
import { compose, prepareArt } from '../src/core/artCompose';
import { ArtFrame } from '../src/core/artFrame';
import { artView, type Blueprint } from '../src/core/blueprint';
import { El } from '../src/core/elements';
import { features } from '../src/core/features';
import { buildGlowField, createGlowField } from '../src/core/layers/glow';
import { defaultParams } from '../src/core/params';
import { layers } from '../src/core/render';
import { shadeCells } from '../src/core/shadeCells';
import { World } from '../src/core/world';
import { Frontier } from '../src/gen/frontier';
import { generate } from '../src/gen/generate';
import { scan } from '../src/gen/scan';
import { step } from '../src/sim/step';
import { bench, finish, record, value } from './harness';

const K = 4;
const params = defaultParams();
const MB = 1024 * 1024;

function revealed(bp: Blueprint, seed: number): World {
  const w = new World(bp, seed, params);
  new Frontier(bp).revealAll(w);
  return w;
}

/** Fill the EMPTY cells of a rectangle with `el`. */
function fill(w: World, x0: number, y0: number, x1: number, y1: number, el: number): number {
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (w.el[y * w.w + x] !== El.EMPTY) continue;
      w.set(x, y, el, { aux: (x * 31 + y * 17) & 255, life: 150 });
      n++;
    }
  }
  return n;
}

/** Mean / worst milliseconds per sim tick over a stretch of ticks. */
function ticks(name: string, w: World, count: number): void {
  const t: number[] = [];
  for (let i = 0; i < count; i++) {
    const s = performance.now();
    step(w);
    t.push(performance.now() - s);
  }
  record(`${name}: ms per tick (first 60)`, 'ms', t.slice(0, 60));
  record(`${name}: ms per tick (after 60)`, 'ms', t.slice(60));
}

describe('benchmarks', () => {
  it('generation', () => {
    for (const k of [1, 2, 4]) bench(`generate() k=${k}`, () => generate(1, params, { k }), k === 4 ? 8 : 10, 1);
    bench('generate() k=4, 4 other seeds (mean of calls)', () => {
      for (const s of [2, 3, 4, 5]) generate(s, params, { k: K });
    }, 4, 1);

    // per-feature breakdown at k=4 (wrap every feature's run, generate a few times)
    const spent: Record<string, number[]> = {};
    const originals = features.all().map((f) => [f, f.run] as const);
    for (const [f, run] of originals) {
      f.run = (ctx) => {
        const s = performance.now();
        run(ctx);
        (spent[f.name] ??= []).push(performance.now() - s);
      };
    }
    try {
      generate(1, params, { k: K }); // warm
      for (const k of Object.keys(spent)) spent[k].length = 0;
      for (const s of [1, 2, 3, 4, 5, 6]) generate(s, params, { k: K });
    } finally {
      for (const [f, run] of originals) f.run = run;
    }
    for (const [name, t] of Object.entries(spent)) record(`generate() feature ${name}`, 'ms', t);
  });

  it('world: reveal, hash, scan', () => {
    const bp = generate(1, params, { k: K });
    bench('World alloc (960x256)', () => new World(bp, 1, params), 20);
    bench('Frontier.revealAll', () => revealed(bp, 1), 20);
    const w = revealed(bp, 1);
    bench('World.hash()', () => w.hash(), 20);
    bench('scan(world)', () => scan(w), 20);
  });

  it('sim step: ms per tick in four scenes', () => {
    const bp = generate(1, params, { k: K });
    ticks('sim quiet painting', revealed(bp, 1), 120);

    const lake = revealed(bp, 2);
    value('sim lake: water cells poured', 'cells', fill(lake, 100, 150, 400, 225, El.WATER));
    ticks('sim lake settling', lake, 120);

    const forest = revealed(bp, 3);
    let lit = 0;
    for (let i = 0; i < forest.size && lit < 60; i++) {
      if (forest.el[i] === El.TREE && i % 7 === 0) {
        forest.set(i % forest.w, (i / forest.w) | 0, El.FIRE, { aux: El.TREE, life: 70 });
        lit++;
      }
    }
    ticks('sim forest fire', forest, 120);

    const busy = revealed(bp, 4);
    fill(busy, 20, 140, 260, 200, El.WATER);
    fill(busy, 500, 120, 700, 170, El.ASH);
    for (let i = 0; i < busy.size && lit < 160; i++) {
      if (busy.el[i] === El.TREE && i % 9 === 0) {
        busy.set(i % busy.w, (i / busy.w) | 0, El.FIRE, { aux: El.TREE, life: 70 });
        lit++;
      }
    }
    ticks('sim busy (water + ash + fire)', busy, 120);
  });

  it('frame: art compose, shaders, glow, cells layer', () => {
    const bp = generate(1, params, { k: K });
    const view = artView(bp)!;
    const aw = bp.w * K;
    const out = new Uint32Array(aw * bp.h * K);

    bench('prepareArt (one time per painting)', () => {
      // a fresh view each time defeats the cache
      prepareArt({ ...view, art: { ...view.art } });
    }, 5, 1);
    const prep = prepareArt(view);

    const w = revealed(bp, 1);
    bench('frame: compose art (untouched painting)', () => compose(out, w.el, w.plane, prep, w.w), 20);
    bench('frame: shadeCells (nothing to shade)', () => shadeCells(out, w, K, view, w.w), 20);

    // a hole cut in the painting: compose's slow path
    w.clearCircle(300, 170, 40, { cut: true });
    step(w);
    bench('frame: compose art (a 40-cell hole)', () => compose(out, w.el, w.plane, prep, w.w), 20);

    const lake = revealed(bp, 2);
    const n = fill(lake, 100, 150, 400, 225, El.WATER);
    value('frame: lake size', 'cells', n);
    for (let i = 0; i < 60; i++) step(lake);
    bench('frame: shadeCells (lake)', () => shadeCells(out, lake, K, view, lake.w), 15);
    const big = revealed(bp, 3);
    const nb = fill(big, 20, 130, 700, 225, El.WATER);
    value('frame: big lake size', 'cells', nb);
    for (let i = 0; i < 40; i++) step(big);
    bench('frame: shadeCells (big lake)', () => shadeCells(out, big, K, view, big.w), 10);

    const fire = revealed(bp, 4);
    let lit = 0;
    for (let i = 0; i < fire.size && lit < 300; i++) {
      if (fire.el[i] === El.TREE) {
        fire.set(i % fire.w, (i / fire.w) | 0, El.FIRE, { aux: El.TREE, life: 70 });
        lit++;
      }
    }
    for (let i = 0; i < 20; i++) step(fire);
    bench('frame: shadeCells (forest fire)', () => shadeCells(out, fire, K, view, fire.w), 15);
    // the ink layer as the pages run it: a persistent frame, redrawn only where tiles changed
    const artFrame = (name: string, wd: World, everyFrame?: () => void) => {
      const f = new ArtFrame();
      f.update(out, wd, view, wd.w, K, true);
      bench(`ink frame: ${name}`, () => {
        everyFrame?.();
        f.update(out, wd, view, wd.w, K, true);
      }, 20);
      value(`ink frame: ${name}: tiles redrawn`, 'tiles', f.tilesDrawn);
    };
    artFrame('idle painting', w);
    artFrame('lake (10k cells, animating)', lake);
    artFrame('big lake (35k cells, animating)', big);
    artFrame('forest fire', fire);
    let cutX = 60;
    artFrame('a small cut every frame', w, () => {
      w.clearCircle(cutX, 120, 4, { cut: true });
      cutX = cutX > 880 ? 60 : cutX + 9;
    });
    const field = createGlowField();
    bench('frame: glow field (forest fire)', () => buildGlowField(fire, field), 15);
    bench('frame: glow field (nothing glowing)', () => buildGlowField(w, createGlowField()), 15);

    // the plain cells layer (pixel layer, 1 px per cell)
    const cells = layers.get('cells')!;
    const pixels = new Uint32Array(w.size);
    const rc = { pixels, world: lake, shaded: true, scale: K } as never;
    bench('frame: cells layer (lake, shaded)', () => cells.draw(rc), 20);
    const rc2 = { pixels, world: lake, shaded: false, scale: 1 } as never;
    bench('frame: cells layer (lake, flat colors)', () => cells.draw(rc2), 20);
    const paper = layers.get('paper')!;
    bench('frame: paper layer', () => paper.draw({ pixels, world: w } as never), 20);
  });

  it('memory (MB of typed arrays)', () => {
    const bp = generate(1, params, { k: K });
    const view = artView(bp)!;
    let art = bp.art!.bg.byteLength;
    for (const p of bp.art!.planes) art += p.byteLength;
    value('memory: blueprint art planes + bg', 'MB', art / MB);
    value('memory: prepared initial image', 'MB', prepareArt(view).initial.byteLength / MB);
    value('memory: art output buffer (per page)', 'MB', (bp.w * K * bp.h * K * 4) / MB);
    const w = new World(bp, 1, params);
    let cellsBytes = w.el.byteLength + w.life.byteLength + w.aux.byteLength + w.vx.byteLength + w.vy.byteLength + w.owner.byteLength + w.flags.byteLength + w.plane.byteLength;
    for (let d = 0; d < w.behindEl.length; d++) cellsBytes += w.behindEl[d].byteLength + w.behindOwner[d].byteLength + w.behindPlane[d].byteLength;
    value('memory: World arrays', 'MB', cellsBytes / MB);
    expect(art).toBeGreaterThan(0);
    finish();
  });
});
