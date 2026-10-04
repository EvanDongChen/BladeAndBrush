import { describe, expect, it } from 'vitest';
import './helpers';
import { createBlueprint, type ArtView } from '../src/core/blueprint';
import { NO_PLANE } from '../src/core/constants';
import { El } from '../src/core/elements';
import { defaultParams } from '../src/core/params';
import { shadeCells } from '../src/core/shadeCells';
import { resolveShaders, sampleTexture, SHADED, SHADER, shaders } from '../src/core/shaders';
import { World } from '../src/core/world';

const K = 4;
const world = (w: number, h: number) => new World({ w, h }, 1, defaultParams());
const run = (wd: World, view?: ArtView) => {
  const out = new Uint32Array(wd.w * K * wd.h * K);
  shadeCells(out, wd, K, view, wd.w);
  return out;
};
const alphaAt = (out: Uint32Array, wd: World, x: number, y: number) => out[y * wd.w * K + x] >>> 24;
const luma = (c: number) => (c & 255) + ((c >>> 8) & 255) + ((c >>> 16) & 255);

describe('shader registry', () => {
  it('resolves element names to ids, and leaves sprites unshaded', () => {
    resolveShaders();
    expect(shaders.size).toBeGreaterThanOrEqual(4);
    for (const e of [El.WATER, El.ROCK, El.FIRE, El.SMOKE, El.TREE]) {
      expect(SHADED[e]).toBe(1);
      expect(SHADER[e]).toBeDefined();
    }
    expect(SHADED[El.EMPTY]).toBe(0);
  });

  it('stroke textures are deterministic and tile', () => {
    expect(sampleTexture('flow', 10, 20)).toBe(sampleTexture('flow', 10 + 256, 20 + 512));
    expect(sampleTexture('hatch', -3, -7)).toBe(sampleTexture('hatch', 253, 249));
  });
});

describe('shadeCells', () => {
  it('draws a lone cell as a soft rounded blob that spills at most one cell around it', () => {
    const wd = world(7, 7);
    wd.set(3, 3, El.WATER);
    const out = run(wd);
    expect(alphaAt(out, wd, 3 * K + 2, 3 * K + 2)).toBeGreaterThan(150); // centre
    expect(alphaAt(out, wd, 3 * K, 3 * K)).toBeLessThan(alphaAt(out, wd, 3 * K + 2, 3 * K + 2)); // corner softer
    for (let y = 0; y < 7 * K; y++) {
      for (let x = 0; x < 7 * K; x++) {
        const nearCell = x >= 2 * K && x < 5 * K && y >= 2 * K && y < 5 * K;
        if (!nearCell) expect(out[y * 7 * K + x]).toBe(0);
      }
    }
  });

  it('turns a staircase edge into a smooth slope (the empty cells beside it get partly filled)', () => {
    const wd = world(12, 12);
    for (let i = 0; i < 8; i++) wd.set(2 + i, 2 + i, El.ROCK);
    const out = run(wd);
    // a cell just beside the diagonal's step has some ink, though the world cell there is empty
    expect(wd.get(3, 2)).toBe(El.EMPTY);
    let spill = 0;
    for (let y = 2 * K; y < 3 * K; y++) for (let x = 3 * K; x < 4 * K; x++) spill += out[y * 12 * K + x] >>> 24;
    expect(spill).toBeGreaterThan(0);
  });

  it('joins neighbouring cells without seams', () => {
    const wd = world(6, 3);
    for (let x = 1; x <= 4; x++) wd.set(x, 1, El.ROCK);
    const out = run(wd);
    for (let x = 2 * K; x < 4 * K; x++) expect(alphaAt(out, wd, x, 1 * K + 2)).toBeGreaterThan(240); // along the middle row
  });

  it('water is lighter at the surface than at the bottom of its body', () => {
    const wd = world(8, 40);
    for (let y = 4; y < 38; y++) for (let x = 2; x < 6; x++) wd.set(x, y, El.WATER);
    const out = run(wd);
    const sample = (cy: number) => {
      let s = 0;
      for (let x = 2 * K; x < 6 * K; x++) s += luma(out[(cy * K + 2) * wd.w * K + x]);
      return s;
    };
    expect(sample(6)).toBeGreaterThan(sample(35));
  });

  it('is deterministic for the same world and tick', () => {
    const make = () => {
      const wd = world(20, 20);
      for (let y = 8; y < 18; y++) for (let x = 2; x < 18; x++) wd.set(x, y, y > 12 ? El.WATER : El.ROCK, { aux: x * 7 });
      wd.tick = 33;
      return Array.from(run(wd));
    };
    expect(make()).toEqual(make());
  });

  it('skips cells that are showing the generator art, shades the rest', () => {
    const wd = world(12, 6);
    const bp = createBlueprint(1, defaultParams(), { w: 12, h: 6 });
    bp.el[2 * 12 + 1] = El.ROCK;
    bp.plane = new Uint8Array(72).fill(NO_PLANE);
    bp.plane[2 * 12 + 1] = 1;
    const view: ArtView = { art: { k: K, planes: [], bg: new Uint32Array(0) }, w: 12, h: 6, el: bp.el, plane: bp.plane, planes: [] };
    wd.set(1, 2, El.ROCK);
    wd.plane[2 * 12 + 1] = 1; // pristine: same element and plane as the blueprint
    for (let y = 1; y <= 3; y++) for (let x = 6; x <= 8; x++) wd.set(x, y, El.ROCK); // a loose piece, not in the blueprint
    const out = run(wd, view);
    expect(alphaAt(out, wd, 1 * K + 2, 2 * K + 2)).toBe(0);
    expect(alphaAt(out, wd, 7 * K + 2, 2 * K + 2)).toBeGreaterThan(200);
  });
});
