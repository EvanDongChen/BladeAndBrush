import { describe, expect, it } from 'vitest';
import { El } from '../src/core/elements';
import { ActionDriver, type ActionLog } from '../src/core/replay';
import type { World } from '../src/core/world';
import { bodyCount } from '../src/sim/behaviors/rigid';
import { DEBRIS } from '../src/sim/elements/debris';
import { EARTH } from '../src/sim/elements/earth';
import { step } from '../src/sim/step';
import { blueprintWorld } from './helpers';
import { boxWorld, count, fillRect, run, stroke } from './sim-helpers';

describe('every ability is a skill shot', () => {
  const ids = ['slash', 'fire', 'water', 'null', 'push'];
  const scene = () => {
    const world = boxWorld(96, 48);
    fillRect(world, 10, 30, 30, 46, El.ROCK);
    fillRect(world, 40, 38, 55, 46, El.TREE);
    fillRect(world, 60, 42, 80, 46, El.ROCK);
    return world;
  };

  for (const id of ids) {
    it(id + ': nothing happens while aiming or on a plain click', () => {
      const world = scene();
      const before = world.el.slice();
      const driver = new ActionDriver();
      const tick = () => {
        driver.apply(world);
        step(world);
      };
      driver.begin(id, { x: 5, y: 40, speed: 0 }, { radius: 5 });
      tick();
      driver.move({ x: 50, y: 40, speed: 20 });
      tick();
      driver.move({ x: 90, y: 44, speed: 20 });
      tick();
      expect(world.el).toEqual(before); // aiming
      driver.end();

      const clicked = scene();
      stroke(clicked, id, [[45, 40]], { radius: 5 });
      run(clicked, 5);
      expect(clicked.el).toEqual(before); // a click is cancelled
    });
  }
});

describe('fire ability', () => {
  it('a line of fire lights trees, not rock', () => {
    const world = boxWorld();
    fillRect(world, 10, 40, 20, 46, El.TREE);
    fillRect(world, 30, 40, 40, 46, El.ROCK);
    stroke(world, 'fire', [[8, 43], [42, 43]], { radius: 3 });
    run(world, 2);
    expect(count(world, El.FIRE)).toBeGreaterThan(5);
    expect(count(world, El.ROCK)).toBe(64 + 11 * 7);
    run(world, 800);
    expect(count(world, El.TREE)).toBe(0);
    expect(count(world, El.ROCK)).toBe(64 + 11 * 7);
  });
});

describe('water ability', () => {
  it('drops a sheet of water along the line; a longer line drops more', () => {
    const short = boxWorld();
    const long = boxWorld();
    stroke(short, 'water', [[10, 5], [20, 5]], { radius: 3 });
    stroke(long, 'water', [[10, 5], [50, 5]], { radius: 3 });
    run(short, 3);
    run(long, 3);
    expect(count(short, El.WATER)).toBeGreaterThan(10);
    expect(count(long, El.WATER)).toBeGreaterThan(count(short, El.WATER) * 2);
  });
});

describe('push ability', () => {
  const xRange = (world: World, el: number) => {
    let min = Infinity;
    let max = -1;
    for (let i = 0; i < world.size - world.w; i++) {
      if (world.el[i] !== el) continue;
      const x = i % world.w;
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
    return { min, max };
  };

  it('flings loose earth far along the line, and it lands back as earth', () => {
    const world = boxWorld(200, 64);
    fillRect(world, 20, 50, 34, 62, EARTH);
    const earth = count(world, EARTH);
    stroke(world, 'push', [[14, 56], [40, 56]], { radius: 7 });
    run(world, 1);
    expect(count(world, DEBRIS)).toBeGreaterThan(0);
    run(world, 300);
    expect(count(world, DEBRIS)).toBe(0);
    expect(count(world, EARTH)).toBe(earth);
    expect(xRange(world, EARTH).max).toBeGreaterThan(70);
  });

  it('breaks rock into chunks that fly and land intact', () => {
    const world = boxWorld(200, 64);
    fillRect(world, 30, 20, 37, 62, El.ROCK); // pillar standing on the floor
    const rock = count(world, El.ROCK);
    stroke(world, 'push', [[22, 24], [40, 24]], { radius: 6 });
    run(world, 1);
    expect(bodyCount(world)).toBeGreaterThan(0);
    run(world, 400);
    expect(bodyCount(world)).toBe(0);
    expect(count(world, El.ROCK)).toBe(rock);
    expect(xRange(world, El.ROCK).max).toBeGreaterThan(55);
  });

  it('pushing into solid rock still throws material out (walled-in chunks burst into rubble)', () => {
    const world = boxWorld(200, 64);
    fillRect(world, 60, 30, 199, 62, El.ROCK); // a big block
    const rock = count(world, El.ROCK);
    const before = world.el.slice();
    stroke(world, 'push', [[50, 33], [75, 33]], { radius: 10 }); // into its corner
    run(world, 400);
    expect(count(world, DEBRIS)).toBe(0);
    expect(count(world, El.ROCK)).toBe(rock);
    let outside = 0;
    for (let i = 0; i < world.size; i++) if (world.el[i] === El.ROCK && before[i] !== El.ROCK) outside++;
    expect(outside).toBeGreaterThan(20);
  });
});

describe('water sources', () => {
  it('emit water at their rate', () => {
    const world = boxWorld();
    world.sources.push({ x: 30, y: 2, rate: 1.5 });
    run(world, 100);
    expect(count(world, El.WATER)).toBeGreaterThan(120);
    expect(count(world, El.WATER)).toBeLessThan(180);
  });
});

describe('determinism with every ability', () => {
  it('a busy session replays to the same hash', () => {
    const tick = (world: World, driver: ActionDriver) => {
      driver.apply(world);
      step(world);
    };
    const live = blueprintWorld(5);
    const driver = new ActionDriver();
    const script: [number, () => void][] = [
      [2, () => driver.begin('slash', { x: 150, y: 150, speed: 0 }, { radius: 4 })],
      [3, () => driver.move({ x: 200, y: 200, speed: 9 })],
      [4, () => driver.move({ x: 260, y: 236, speed: 11 })],
      [5, () => driver.end()],
      [10, () => driver.begin('water', { x: 160, y: 60, speed: 0 }, { radius: 5 })],
      [11, () => driver.move({ x: 300, y: 50, speed: 9 })],
      [12, () => driver.end()],
      [80, () => driver.begin('fire', { x: 500, y: 230, speed: 0 }, { radius: 6 })],
      [82, () => driver.move({ x: 700, y: 230, speed: 20 })],
      [83, () => driver.end()],
      [90, () => driver.begin('push', { x: 820, y: 200, speed: 0 }, { radius: 8 })],
      [91, () => driver.move({ x: 860, y: 190, speed: 4 })],
      [92, () => driver.end()],
      [95, () => driver.begin('null', { x: 400, y: 220, speed: 0 }, { radius: 6 })],
      [96, () => driver.move({ x: 440, y: 200, speed: 9 })],
      [97, () => driver.end()],
    ];
    for (let t = 0; t < 300; t++) {
      for (const [at, fn] of script) if (at === t) fn();
      tick(live, driver);
    }
    expect(driver.uses).toBe(5);
    const untouched = blueprintWorld(5);
    while (untouched.tick < live.tick) step(untouched);
    expect(live.hash()).not.toBe(untouched.hash()); // the abilities really did something

    const log = JSON.parse(JSON.stringify(driver.log)) as ActionLog;
    const replayed = blueprintWorld(5);
    const player = new ActionDriver(log);
    while (replayed.tick < live.tick) tick(replayed, player);
    expect(replayed.hash()).toBe(live.hash());
  });
});
