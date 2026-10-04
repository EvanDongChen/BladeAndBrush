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
  it('draws a lone cell with soft rounded corners, inside its own cell only', () => {
    const wd = world(5, 5);
    wd.set(2, 2, El.WATER);
    const out = run(wd);
    expect(alphaAt(out, wd, 2 * K + 2, 2 * K + 2)).toBeGreaterThan(200); // centre
    expect(alphaAt(out, wd, 2 * K, 2 * K)).toBeLessThan(alphaAt(out, wd, 2 * K + 2, 2 * K + 2)); // corner softer
    for (let y = 0; y < 5 * K; y++) {
      for (let x = 0; x < 5 * K; x++) {
        const inCell = x >= 2 * K && x < 3 * K && y >= 2 * K && y < 3 * K;
        if (!inCell) expect(out[y * 5 * K + x]).toBe(0);
      }
    }
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
    const wd = world(6, 4);
    const bp = createBlueprint(1, defaultParams(), { w: 6, h: 4 });
    bp.el[1 * 6 + 1] = El.ROCK;
    bp.plane = new Uint8Array(24).fill(NO_PLANE);
    bp.plane[1 * 6 + 1] = 1;
    const view: ArtView = { art: { k: K, planes: [], bg: new Uint32Array(0) }, w: 6, h: 4, el: bp.el, plane: bp.plane, planes: [] };
    wd.set(1, 1, El.ROCK);
    wd.plane[1 * 6 + 1] = 1; // pristine: same element and plane as the blueprint
    wd.set(4, 1, El.ROCK); // not in the blueprint: a loose piece
    const out = run(wd, view);
    expect(alphaAt(out, wd, 1 * K + 2, 1 * K + 2)).toBe(0);
    expect(alphaAt(out, wd, 4 * K + 2, 1 * K + 2)).toBeGreaterThan(200);
  });
});
