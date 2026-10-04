import { describe, expect, it } from 'vitest';
import { El } from '../src/core/elements';
import { MOON } from '../src/gen/elements/moon';
import type { World } from '../src/core/world';
import { markUnsupported } from '../src/sim/behaviors/rigid';
import { boxWorld, count, fillRect, rowsOf, run, stroke } from './sim-helpers';

/** A full moon disc hanging in the air (centre 48, 15; radius 10, so rows 5 to 25). */
function moonWorld(): World {
  const world = boxWorld(96, 64);
  world.forCircle(48, 15, 10, (x, y) => world.set(x, y, MOON, { aux: 128 }));
  return world;
}

const clear = (world: World, x0: number, y0: number, x1: number, y1: number) => fillRect(world, x0, y0, x1, y1, El.EMPTY);

/** MOON cells still in the sky (the top 26 rows). */
function inSky(world: World): number {
  let n = 0;
  for (let i = 0; i < world.w * 26; i++) if (world.el[i] === MOON) n++;
  return n;
}

describe('the moon', () => {
  it('hangs in the sky while it is whole', () => {
    const world = moonWorld();
    const before = count(world, MOON);
    run(world, 200);
    expect(count(world, MOON)).toBe(before);
    expect(rowsOf(world, MOON).top).toBe(5);
  });

  it('keeps its main body up when only a chip is knocked off the edge, and the chip falls', () => {
    const world = moonWorld();
    const before = count(world, MOON);
    clear(world, 55, 4, 55, 26); // a thin cut that leaves a sliver on the right edge
    const left = count(world, MOON);
    markUnsupported(world);
    run(world, 300);
    expect(left).toBeLessThan(before);
    expect(inSky(world)).toBeGreaterThan(before / 2); // the main body is still up
    expect(count(world, MOON)).toBe(left); // nothing else was lost
    expect(rowsOf(world, MOON).bottom).toBeGreaterThan(40); // the chip landed on the floor
  });

  it('comes loose and falls, every piece, once it is cut in two', () => {
    const world = moonWorld();
    clear(world, 36, 14, 60, 16); // a clean cut through the middle
    const left = count(world, MOON);
    markUnsupported(world);
    run(world, 300);
    expect(count(world, MOON)).toBe(left); // nothing vanished
    expect(inSky(world)).toBe(0); // both halves fell out of the sky
    expect(rowsOf(world, MOON).top).toBeGreaterThan(30);
  });

  it('drops pieces when a real slash carves through it', () => {
    const world = moonWorld();
    stroke(world, 'slash', [[30, 15], [48, 15, 12], [66, 15, 12]], { radius: 3 });
    run(world, 300);
    expect(rowsOf(world, MOON).bottom).toBeGreaterThan(40); // something dropped to the ground
  });
});
