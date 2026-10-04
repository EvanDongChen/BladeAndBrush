import { describe, expect, it } from 'vitest';
import { El } from '../src/core/elements';
import { MOON } from '../src/gen/elements/moon';
import { levels } from '../src/core/levels';
import { objectsOf } from '../src/core/objects';
import { defaultParams } from '../src/core/params';
import { ActionDriver } from '../src/core/replay';
import { World } from '../src/core/world';
import { Frontier } from '../src/gen/frontier';
import { generate } from '../src/gen/generate';
import { markUnsupported } from '../src/sim/behaviors/rigid';
import { step } from '../src/sim/step';
import { boxWorld, count, fillRect, rowsOf, run, stroke } from './sim-helpers';

/** A full moon disc hanging in the air (centre 48, 15; radius 10, so rows 5 to 25). */
function moonWorld(): World {
  const world = boxWorld(96, 64);
  world.forCircle(48, 15, 10, (x, y) => {
    world.set(x, y, MOON, { aux: 128 });
    world.obj[y * world.w + x] = 7; // the moon's object id: what holds it together as one piece
  });
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

  it('falls entirely even when the cut only separates a small sliver', () => {
    const world = moonWorld();
    const before = count(world, MOON);
    clear(world, 55, 4, 55, 26); // a thin cut that leaves a sliver on the right edge
    const left = count(world, MOON);
    markUnsupported(world);
    run(world, 300);
    expect(left).toBeLessThan(before);
    expect(inSky(world)).toBe(0); // the big piece and the sliver both fell
    expect(count(world, MOON)).toBe(left); // nothing else was lost
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

  it.each([2, 3])('level 2: slashing the painted moon (brush radius %i) brings every piece down', (radius) => {
    const level = levels.get('level-2')!;
    const params = defaultParams();
    for (const [key, p] of Object.entries(level.params)) params[key] = p.value;
    const bp = generate(level.seed, params, { features: level.featuresEnabled, setpieces: level.setpieces });
    const world = new World(level.dims, level.seed, { ...params });
    new Frontier(bp).revealAll(world);
    for (let t = 0; t < 120; t++) step(world);
    const moon = objectsOf(world, 'moon')[0];
    const high = () => {
      let n = 0;
      for (let i = 0; i < world.w * (moon.bbox[3] + 30); i++) if (world.el[i] === MOON) n++; // anywhere near where the moon hung
      return n;
    };
    expect(high()).toBeGreaterThan(1000); // whole, it hangs
    const d = new ActionDriver();
    d.begin('slash', { x: moon.x - 40, y: moon.y, speed: 0 }, { radius });
    d.apply(world);
    step(world);
    d.move({ x: moon.x + 40, y: moon.y, speed: 6 });
    for (let t = 0; t <= 20; t++) {
      d.apply(world);
      step(world);
    }
    d.end();
    d.apply(world);
    for (let t = 0; t < 400; t++) step(world);
    expect(high()).toBe(0); // nothing of it is left hanging in the sky
  }, 60_000);
});
