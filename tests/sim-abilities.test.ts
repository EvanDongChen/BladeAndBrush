import { describe, expect, it } from 'vitest';
import { El } from '../src/core/elements';
import { ActionDriver, type ActionLog } from '../src/core/replay';
import type { World } from '../src/core/world';
import { EARTH } from '../src/sim/elements/earth';
import { step } from '../src/sim/step';
import { blueprintWorld } from './helpers';
import { boxWorld, count, fillRect, run, stroke } from './sim-helpers';

describe('fire ability', () => {
  it('lights trees, not rock', () => {
    const world = boxWorld();
    fillRect(world, 10, 40, 20, 46, El.TREE);
    fillRect(world, 30, 40, 40, 46, El.ROCK);
    stroke(world, 'fire', [[15, 43], [35, 43]], { radius: 3 });
    expect(count(world, El.FIRE)).toBeGreaterThan(5);
    expect(count(world, El.ROCK)).toBe(64 + 11 * 7);
    run(world, 800);
    expect(count(world, El.TREE)).toBe(0);
    expect(count(world, El.ROCK)).toBe(64 + 11 * 7);
  });
});

describe('water ability', () => {
  it('pours more the longer it is held', () => {
    const short = boxWorld();
    const long = boxWorld();
    stroke(short, 'water', [[30, 5]], { radius: 3 }, 10);
    stroke(long, 'water', [[30, 5]], { radius: 3 }, 60);
    expect(count(short, El.WATER)).toBeGreaterThan(10);
    expect(count(long, El.WATER)).toBeGreaterThan(count(short, El.WATER) * 3);
  });
});

describe('push ability', () => {
  it('moves material along the drag and conserves every element', () => {
    const world = boxWorld(96, 48);
    fillRect(world, 20, 30, 30, 46, El.ROCK);
    fillRect(world, 31, 40, 34, 46, EARTH);
    const before = world.countByElement().slice();
    const meanX = () => {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < world.size; i++) if (world.el[i] === El.ROCK && (i / world.w | 0) < 46) (sum += i % world.w), n++;
      return sum / n;
    };
    const x0 = meanX();
    stroke(world, 'push', [[22, 36], [30, 36], [38, 36], [46, 36]], { radius: 6 });
    expect(meanX()).toBeGreaterThan(x0 + 2);
    expect(world.countByElement()).toEqual(before);
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
      [70, () => driver.end()],
      [80, () => driver.begin('fire', { x: 500, y: 230, speed: 0 }, { radius: 6 })],
      [82, () => driver.move({ x: 700, y: 230, speed: 20 })],
      [83, () => driver.end()],
      [90, () => driver.begin('push', { x: 820, y: 200, speed: 0 }, { radius: 8 })],
      [91, () => driver.move({ x: 860, y: 190, speed: 4 })],
      [92, () => driver.end()],
      [95, () => driver.begin('null', { x: 400, y: 220, speed: 0 }, { radius: 6 })],
      [96, () => driver.end()],
    ];
    for (let t = 0; t < 300; t++) {
      for (const [at, fn] of script) if (at === t) fn();
      tick(live, driver);
    }
    expect(driver.uses).toBe(5);
    expect(count(live, El.STAIN) + count(live, El.ASH) + count(live, El.SMOKE)).toBeGreaterThan(0);

    const log = JSON.parse(JSON.stringify(driver.log)) as ActionLog;
    const replayed = blueprintWorld(5);
    const player = new ActionDriver(log);
    while (replayed.tick < live.tick) tick(replayed, player);
    expect(replayed.hash()).toBe(live.hash());
  });
});
