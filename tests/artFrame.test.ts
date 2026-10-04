import { describe, expect, it } from 'vitest';
import '../src/pages/bootstrap';
import { compose, prepareArt } from '../src/core/artCompose';
import { ArtFrame } from '../src/core/artFrame';
import { artView, type ArtView } from '../src/core/blueprint';
import { El } from '../src/core/elements';
import { defaultParams } from '../src/core/params';
import { shadeCells } from '../src/core/shadeCells';
import { World } from '../src/core/world';
import { Frontier } from '../src/gen/frontier';
import { generate } from '../src/gen/generate';
import { step } from '../src/sim/step';

const K = 2;

/** The whole frame drawn from scratch: what ArtFrame must always match. */
function reference(world: World, view: ArtView | undefined, fx: number, shaded: boolean): Uint32Array {
  const out = new Uint32Array(world.w * K * world.h * K);
  if (view) compose(out, world.el, world.plane, prepareArt(view), fx);
  if (shaded) shadeCells(out, world, K, view, fx);
  return out;
}

/** Index of the first differing pixel, or -1. */
function firstDiff(a: Uint32Array, b: Uint32Array): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

describe('ArtFrame (redraws only changed tiles)', () => {
  it('matches a full redraw while the frontier unrolls, cells are cut, and water and fire move', () => {
    const params = defaultParams();
    const bp = generate(3, params, { k: K });
    const view = artView(bp)!;
    const world = new World(bp, 3, params);
    const frontier = new Frontier(bp);
    const frame = new ArtFrame();
    const out = new Uint32Array(world.w * K * world.h * K);
    // what the canvas shows: only the rectangles update() reports get copied (uploaded)
    const shown = new Uint32Array(out.length);
    const aw = world.w * K;
    const check = (fx: number, label: string) => {
      const rects = frame.update(out, world, view, fx, K, true);
      for (let r = 0; r < frame.rectCount; r++) {
        const { x, y, w, h } = rects[r];
        for (let yy = y; yy < y + h; yy++) shown.set(out.subarray(yy * aw + x, yy * aw + x + w), yy * aw + x);
      }
      const ref = reference(world, view, fx, true);
      expect(firstDiff(out, ref), `${label}: first differing pixel`).toBe(-1);
      expect(firstDiff(shown, ref), `${label}: first differing uploaded pixel`).toBe(-1);
    };

    // unrolling
    for (let f = 0; f < 6; f++) {
      for (let t = 0; t < 20; t++) {
        frontier.advance(world);
        step(world);
      }
      check(frontier.x, `unroll ${f}`);
    }
    frontier.revealAll(world);
    check(world.w, 'revealed');
    check(world.w, 'idle');
    expect(frame.tilesDrawn).toBe(0);

    // cuts, a lake, a fire, then let them run
    world.clearCircle(300, 150, 25, { cut: true });
    for (let y = 120; y < 200; y++) for (let x = 500; x < 620; x++) if (world.el[y * world.w + x] === El.EMPTY) world.set(x, y, El.WATER);
    let lit = 0;
    for (let i = 0; i < world.size && lit < 120; i++) {
      if (world.el[i] === El.TREE) {
        world.set(i % world.w, (i / world.w) | 0, El.FIRE, { aux: El.TREE, life: 70 });
        lit++;
      }
    }
    check(world.w, 'after edits');
    for (let f = 0; f < 12; f++) {
      for (let t = 0; t < 3; t++) step(world);
      check(world.w, `sim ${f}`);
    }
  });

  it('matches without art (the sandbox) and redraws nothing when nothing changed', () => {
    const world = new World({ w: 96, h: 64 }, 1, defaultParams());
    for (let y = 30; y < 64; y++) for (let x = 0; x < 96; x++) world.set(x, y, y < 40 ? El.WATER : El.ROCK);
    world.set(40, 10, El.ROCK);
    const frame = new ArtFrame();
    const out = new Uint32Array(world.w * K * world.h * K);
    for (let f = 0; f < 8; f++) {
      if (f === 4) world.set(41, 10, El.ROCK);
      if (f > 0) step(world);
      frame.update(out, world, undefined, world.w, K, true);
      expect(firstDiff(out, reference(world, undefined, world.w, true)), `frame ${f}`).toBe(-1);
    }
    // only the water's tiles keep animating: a 6x4-tile world, water in rows 1-2
    expect(frame.tilesDrawn).toBeLessThan(6 * 4);
  });
});

describe('resampleArt (art shown smaller than generated)', () => {
  it('k=2 from k=4 is the premultiplied 2x2 average, and k=3 keeps every cell inside its own pixels', async () => {
    const { resampleArt } = await import('../src/core/artResample');
    const params = defaultParams();
    const bp = generate(2, params, { k: 4 });
    const view = artView(bp)!;
    const half = resampleArt(view, 2);
    expect(half.art.k).toBe(2);
    expect(resampleArt(view, 2)).toBe(half); // cached
    const sw = bp.w * 4;
    const dw = bp.w * 2;
    const src = view.art.planes[0];
    const dst = half.art.planes[0];
    let checked = 0;
    for (let oy = 100; oy < 400; oy += 7) {
      for (let ox = 0; ox < dw; ox += 13) {
        let a = 0;
        let r = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const c = src[(oy * 2 + dy) * sw + ox * 2 + dx];
          a += c >>> 24;
          r += (c & 255) * (c >>> 24);
        }
        const d = dst[oy * dw + ox];
        if (a / 4 < 0.5) {
          expect(d).toBe(0);
          continue;
        }
        expect(Math.abs((d >>> 24) - a / 4)).toBeLessThanOrEqual(1);
        expect(Math.abs((d & 255) - r / a)).toBeLessThanOrEqual(1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
    // k=3: the ink frame on the resampled view still equals a full redraw at that k
    const third = resampleArt(view, 3);
    const world = new World(bp, 2, params);
    new Frontier(bp).revealAll(world);
    world.clearCircle(400, 150, 20, { cut: true });
    const out = new Uint32Array(world.w * 3 * world.h * 3);
    new ArtFrame().update(out, world, third, world.w, 3, true);
    const ref = new Uint32Array(out.length);
    compose(ref, world.el, world.plane, prepareArt(third), world.w);
    shadeCells(ref, world, 3, third, world.w);
    expect(firstDiff(out, ref)).toBe(-1);
  });
});
