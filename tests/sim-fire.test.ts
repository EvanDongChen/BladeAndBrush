import { describe, expect, it } from 'vitest';
import { El } from '../src/core/elements';
import { STEAM } from '../src/sim/elements/steam';
import { boxWorld, count, fillRect, rowsOf, run } from './sim-helpers';

describe('fire', () => {
  it('burns through a row of trees, leaves ash, and stops at rock', () => {
    const world = boxWorld(64, 48);
    fillRect(world, 4, 40, 28, 46, El.TREE); // the row that should burn
    fillRect(world, 29, 4, 32, 46, El.ROCK); // a tall rock wall flames cannot get over
    fillRect(world, 33, 40, 45, 46, El.TREE); // trees behind the wall
    const rockBefore = count(world, El.ROCK);
    let ignites = 0;
    world.events.on('ignite', () => ignites++);

    world.set(3, 46, El.FIRE);
    run(world, 900);

    let burntSide = 0;
    let safeSide = 0;
    for (let i = 0; i < world.size; i++) {
      if (world.el[i] !== El.TREE) continue;
      if (i % world.w < 29) burntSide++;
      else safeSide++;
    }
    expect(burntSide).toBe(0);
    expect(safeSide).toBe(13 * 7);
    expect(count(world, El.ROCK)).toBe(rockBefore);
    expect(count(world, El.FIRE)).toBe(0);
    expect(count(world, El.ASH)).toBeGreaterThan(0);
    expect(ignites).toBeGreaterThan(100);
  });

  it('water puts fire out and makes steam', () => {
    const wet = boxWorld();
    const dry = boxWorld();
    for (const world of [wet, dry]) fillRect(world, 10, 40, 20, 46, El.FIRE);
    for (const world of [wet, dry]) for (let i = 0; i < world.size; i++) if (world.el[i] === El.FIRE) {
      world.aux[i] = El.TREE; // burning wood: long-lived, stays put
      world.life[i] = 250;
    }
    fillRect(wet, 8, 20, 22, 32, El.WATER);
    let sawSteam = false;
    for (let t = 0; t < 120; t++) {
      run(wet, 1);
      sawSteam ||= count(wet, STEAM) > 0;
    }
    run(dry, 120);
    expect(sawSteam).toBe(true);
    expect(count(wet, El.FIRE)).toBe(0);
    expect(count(dry, El.FIRE)).toBeGreaterThan(50);
  });

  it('does not spread when the fireSpread flag is off', async () => {
    const { flags } = await import('../src/core/config');
    flags.fireSpread = false;
    try {
      const world = boxWorld();
      fillRect(world, 10, 40, 30, 46, El.TREE);
      world.set(9, 46, El.FIRE);
      run(world, 300);
      expect(count(world, El.TREE)).toBe(21 * 7);
    } finally {
      flags.fireSpread = true;
    }
  });
});

describe('gases', () => {
  it('smoke rises and fades away', () => {
    const world = boxWorld();
    fillRect(world, 30, 42, 33, 45, El.SMOKE);
    run(world, 15);
    expect(rowsOf(world, El.SMOKE).bottom).toBeLessThan(42);
    run(world, 400);
    expect(count(world, El.SMOKE)).toBe(0);
  });

  it('steam rises and partly condenses back into water', () => {
    const world = boxWorld();
    fillRect(world, 10, 30, 50, 40, STEAM);
    run(world, 600);
    expect(count(world, STEAM)).toBe(0);
    expect(count(world, El.WATER)).toBeGreaterThan(0);
  });
});
