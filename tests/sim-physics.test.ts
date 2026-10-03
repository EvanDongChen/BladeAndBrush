import { describe, expect, it } from 'vitest';
import { El } from '../src/core/elements';
import { EARTH } from '../src/sim/elements/earth';
import { boxWorld, count, fillRect, rowsOf, run } from './sim-helpers';

describe('powder', () => {
  it('falls, piles and conserves count', () => {
    const world = boxWorld();
    fillRect(world, 30, 2, 33, 11, EARTH); // 4 x 10 column in the air
    run(world, 200);
    expect(count(world, EARTH)).toBe(40);
    const { top, bottom } = rowsOf(world, EARTH);
    expect(bottom).toBe(46); // resting on the floor
    expect(46 - top).toBeLessThan(9); // spread into a pile, not a column
  });

  it('gravity param controls fall speed', () => {
    const slow = boxWorld();
    const fast = boxWorld();
    slow.params.gravity = 1;
    fast.params.gravity = 8;
    slow.set(10, 0, El.ASH);
    fast.set(10, 0, El.ASH);
    run(slow, 10);
    run(fast, 10);
    expect(rowsOf(slow, El.ASH).top).toBe(10);
    expect(rowsOf(fast, El.ASH).top).toBe(46);
  });

  it('sinks through water', () => {
    const world = boxWorld();
    fillRect(world, 0, 40, 63, 46, El.WATER);
    world.set(20, 30, EARTH);
    run(world, 150);
    expect(rowsOf(world, EARTH).bottom).toBe(46);
    expect(count(world, El.WATER)).toBe(64 * 7);
  });
});

describe('water', () => {
  it('falls and levels out flat across the floor', () => {
    const world = boxWorld();
    fillRect(world, 28, 5, 35, 20, El.WATER); // 8 x 16 = 128 cells, enough for 2 rows of 64
    run(world, 400);
    expect(count(world, El.WATER)).toBe(128);
    const { top, bottom } = rowsOf(world, El.WATER);
    expect(bottom).toBe(46);
    expect(top).toBe(45);
  });

  it('fills a basin and stays inside it', () => {
    const world = boxWorld();
    fillRect(world, 20, 30, 20, 46, El.ROCK); // left wall
    fillRect(world, 40, 30, 40, 46, El.ROCK); // right wall
    fillRect(world, 25, 5, 34, 14, El.WATER); // 100 cells into a 19-wide basin
    run(world, 400);
    for (let i = 0; i < world.size; i++) {
      if (world.el[i] !== El.WATER) continue;
      const x = i % world.w;
      expect(x).toBeGreaterThan(20);
      expect(x).toBeLessThan(40);
    }
    expect(count(world, El.WATER)).toBe(100);
  });
});
