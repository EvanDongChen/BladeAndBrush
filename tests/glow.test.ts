import { describe, expect, it } from 'vitest';
import { El, registerElement, rgba } from '../src/core/elements';
import { GLOW, glows, registerGlow } from '../src/core/glow';
import { buildGlowField, createGlowField, GLOW_SCALE } from '../src/core/layers/glow';
import { World } from '../src/core/world';
import './sim-helpers';
import { fillRect } from './sim-helpers';

/** Energy at a cell's block: the fourth plane of a band. */
function energy(band: Float32Array, lw: number, lh: number, x: number, y: number): number {
  return band[3 * lw * lh + (y >> 2) * lw + (x >> 2)];
}

describe('glow', () => {
  it('fire is registered as a glowing element', () => {
    expect(glows.has(El.FIRE)).toBe(true);
    expect(GLOW[El.FIRE]?.near).toBeGreaterThan(0);
    expect(GLOW[El.ROCK]).toBeUndefined();
  });

  it('a world with nothing glowing has no glow', () => {
    const world = new World({ w: 64, h: 48 }, 1);
    fillRect(world, 10, 30, 40, 40, El.ROCK);
    expect(buildGlowField(world, createGlowField()).any).toBe(false);
  });

  it('light is brightest at the flames and falls off with distance, wider in the far band', () => {
    const world = new World({ w: 160, h: 80 }, 1);
    fillRect(world, 76, 36, 83, 43, El.FIRE);
    for (let i = 0; i < world.size; i++) if (world.el[i] === El.FIRE) world.life[i] = 20;
    const f = buildGlowField(world, createGlowField());
    expect(f.any).toBe(true);
    const at = (band: Float32Array, dx: number) => energy(band, f.lw, f.lh, 80 + dx, 40);
    for (const band of [f.near, f.far]) {
      expect(at(band, 0)).toBeGreaterThan(at(band, 12));
      expect(at(band, 12)).toBeGreaterThan(at(band, 40));
    }
    // symmetric about the fire's middle (blocks 19 and 20 hold it), up to flicker
    for (const band of [f.near, f.far]) {
      const left = energy(band, f.lw, f.lh, 64, 40); // 3 blocks left of block 19
      const right = energy(band, f.lw, f.lh, 92, 40); // 3 blocks right of block 20
      expect(Math.abs(left - right) / Math.max(left, right)).toBeLessThan(0.3);
    }
    // far away from a small fire the tight halo is gone but the wide one still reaches
    expect(at(f.near, 24)).toBeLessThan(at(f.far, 24) * 4);
    expect(at(f.far, 20)).toBeGreaterThan(at(f.near, 20) * 0.5);
    expect(at(f.far, 20)).toBeGreaterThan(1e-4);
    expect(f.lw).toBe(160 / GLOW_SCALE);
  });

  it('a flame dims as it burns out', () => {
    const lit = (life: number) => {
      const world = new World({ w: 64, h: 48 }, 1);
      fillRect(world, 30, 20, 33, 23, El.FIRE);
      for (let i = 0; i < world.size; i++) if (world.el[i] === El.FIRE) world.life[i] = life;
      const f = buildGlowField(world, createGlowField());
      return energy(f.near, f.lw, f.lh, 31, 21);
    };
    expect(lit(26)).toBeGreaterThan(lit(2) * 1.5);
  });

  it('is deterministic for the same world and tick, and flickers between ticks', () => {
    const make = (tick: number) => {
      const world = new World({ w: 64, h: 48 }, 1);
      fillRect(world, 20, 20, 30, 28, El.FIRE);
      for (let i = 0; i < world.size; i++) if (world.el[i] === El.FIRE) world.life[i] = 30;
      world.tick = tick;
      return Array.from(buildGlowField(world, createGlowField()).near);
    };
    expect(make(10)).toEqual(make(10));
    expect(make(10)).not.toEqual(make(12));
  });

  it('any element can glow, and a second glow for the same element throws', () => {
    registerElement({
      id: 249,
      name: 'zzLantern',
      kind: 'static',
      density: 1,
      flammability: 0,
      solidForScan: false,
      color: () => rgba(255, 240, 200),
    });
    registerGlow({ el: 249, r: 255, g: 230, b: 150, near: 1, far: 0.4 });
    expect(() => registerGlow({ el: 249, r: 0, g: 0, b: 0, near: 1, far: 1 })).toThrow(/Duplicate glow/);
    const world = new World({ w: 64, h: 48 }, 1);
    fillRect(world, 30, 20, 33, 23, 249);
    expect(buildGlowField(world, createGlowField()).any).toBe(true);
  });
});
