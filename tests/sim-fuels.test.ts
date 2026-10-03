import { describe, expect, it } from 'vitest';
import { El } from '../src/core/elements';
import { markUnsupported } from '../src/sim/behaviors/rigid';
import { BAMBOO, BAMBOO_JOINT } from '../src/sim/elements/bamboo';
import { HAY } from '../src/sim/elements/hay';
import type { World } from '../src/core/world';
import { boxWorld, count, fillRect, rowsOf, run, stroke } from './sim-helpers';

/** Cells of `el` that are unburnt, plus cells of it that are still burning (FIRE with it as fuel). */
function fuel(world: World, el: number): number {
  let n = 0;
  for (let i = 0; i < world.size; i++) if (world.el[i] === el || (world.el[i] === El.FIRE && world.aux[i] === el)) n++;
  return n;
}

describe('hay', () => {
  it('falls and piles up, keeping every wisp', () => {
    const world = boxWorld(64, 48);
    fillRect(world, 30, 20, 32, 40, HAY);
    const n = count(world, HAY);
    run(world, 300);
    expect(count(world, HAY)).toBe(n);
    let minX = 99;
    let maxX = -1;
    for (let i = 0; i < world.size; i++) {
      if (world.el[i] !== HAY) continue;
      minX = Math.min(minX, i % world.w);
      maxX = Math.max(maxX, i % world.w);
    }
    expect(maxX - minX).toBeGreaterThanOrEqual(8); // spread out into a heap
    expect(rowsOf(world, HAY).bottom).toBe(world.h - 2); // resting on the floor
    expect(rowsOf(world, HAY).top).toBeGreaterThan(30); // no longer a tall column
  });

  it('is lighter than water, so it floats', () => {
    const world = boxWorld(64, 48);
    fillRect(world, 8, 34, 9, 46, El.ROCK);
    fillRect(world, 31, 34, 32, 46, El.ROCK);
    fillRect(world, 10, 40, 30, 46, El.WATER); // surface at row 40
    fillRect(world, 18, 10, 22, 12, HAY);
    run(world, 300);
    expect(count(world, HAY)).toBe(15);
    expect(rowsOf(world, HAY).bottom).toBeLessThan(40); // sitting on the surface, not sunk
  });

  it('burns and is gone much faster than wood', () => {
    const world = boxWorld(64, 48);
    fillRect(world, 4, 40, 24, 46, El.TREE);
    fillRect(world, 36, 40, 56, 46, HAY);
    world.set(3, 46, El.FIRE);
    world.set(35, 46, El.FIRE);
    let hayGone = -1;
    let woodGone = -1;
    for (let t = 0; t < 2500 && woodGone < 0; t++) {
      run(world, 1);
      if (hayGone < 0 && fuel(world, HAY) === 0) hayGone = t;
      if (woodGone < 0 && fuel(world, El.TREE) === 0) woodGone = t;
    }
    expect(hayGone).toBeGreaterThan(0);
    expect(woodGone).toBeGreaterThan(0);
    expect(hayGone).toBeLessThan(woodGone * 0.6);
  });

  it('goes up as smoke, leaving very little ash', () => {
    const world = boxWorld(64, 48);
    fillRect(world, 20, 40, 40, 46, HAY);
    world.set(19, 46, El.FIRE);
    let sawSmoke = false;
    for (let t = 0; t < 600; t++) {
      run(world, 1);
      sawSmoke ||= count(world, El.SMOKE) > 0;
    }
    expect(sawSmoke).toBe(true);
    expect(fuel(world, HAY)).toBe(0);
    expect(count(world, El.ASH)).toBeLessThan(15);
  });
});

describe('bamboo', () => {
  it('burns, faster than wood, and flames throw sparks', () => {
    const world = boxWorld(64, 48);
    fillRect(world, 4, 30, 24, 46, El.TREE);
    fillRect(world, 36, 30, 56, 46, BAMBOO);
    world.set(3, 46, El.FIRE);
    world.set(35, 46, El.FIRE);
    let bambooGone = -1;
    let woodGone = -1;
    for (let t = 0; t < 2500 && woodGone < 0; t++) {
      run(world, 1);
      if (bambooGone < 0 && fuel(world, BAMBOO) === 0) bambooGone = t;
      if (woodGone < 0 && fuel(world, El.TREE) === 0) woodGone = t;
    }
    expect(bambooGone).toBeGreaterThan(0);
    expect(woodGone).toBeGreaterThan(0);
    expect(bambooGone).toBeLessThan(woodGone * 0.8);
    expect(count(world, El.ASH)).toBeGreaterThan(0);
  });

  it('a stalk keeps standing until cut, and the part above a cut drops', () => {
    const world = boxWorld(64, 48);
    fillRect(world, 20, 10, 21, 46, BAMBOO); // 2 wide, 37 tall
    run(world, 120);
    expect(rowsOf(world, BAMBOO).top).toBe(10); // untouched stalk does not fall
    for (let y = 24; y <= 31; y++) for (let x = 20; x <= 21; x++) world.set(x, y, El.EMPTY, { cut: true });
    markUnsupported(world);
    const left = count(world, BAMBOO);
    run(world, 200);
    expect(count(world, BAMBOO)).toBe(left);
    expect(rowsOf(world, BAMBOO).top).toBeGreaterThan(14); // the top came down onto the stump
  });

  it('painting it puts a dark joint every few rows', () => {
    const world = boxWorld(64, 48);
    stroke(world, 'paint', [[30, 5], [30, 40]], { el: BAMBOO, radius: 1 });
    let joints = 0;
    let stalk = 0;
    for (let y = 5; y <= 40; y++) {
      if (world.el[world.idx(30, y)] !== BAMBOO) continue;
      if (world.aux[world.idx(30, y)] < BAMBOO_JOINT) joints++;
      else stalk++;
    }
    expect(joints).toBeGreaterThanOrEqual(4);
    expect(stalk).toBeGreaterThan(joints * 3);
  });
});
