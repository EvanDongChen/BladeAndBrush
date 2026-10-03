import { afterEach, describe, expect, it } from 'vitest';
import { flags } from '../src/core/config';
import { Flag } from '../src/core/constants';
import { El } from '../src/core/elements';
import type { World } from '../src/core/world';
import { ActionDriver } from '../src/core/replay';
import { step } from '../src/sim/step';
import { boxWorld, count, fillRect, run, stroke } from './sim-helpers';

const cutCells = (world: World) => world.flags.reduce((n, f) => n + (f & Flag.CUT ? 1 : 0), 0);

afterEach(() => {
  flags.splatter = true;
});

describe('slash', () => {
  it('cuts a jagged groove, flags it CUT, emits cut events, and splatters ink that settles into stain', () => {
    const world = boxWorld(96, 64);
    fillRect(world, 0, 20, 95, 62, El.ROCK);
    const rockBefore = count(world, El.ROCK);
    let cuts = 0;
    world.events.on('cut', () => cuts++);

    stroke(world, 'slash', [[10, 30], [30, 34, 12], [50, 38, 12], [70, 42, 12]], { radius: 4 });
    run(world, 3); // the released cut sweeps along its line

    const removed = rockBefore - count(world, El.ROCK);
    expect(removed).toBeGreaterThan(300);
    expect(cuts).toBe(removed);
    expect(cutCells(world)).toBeGreaterThanOrEqual(removed);
    expect(count(world, El.SPLAT) + count(world, El.STAIN)).toBeGreaterThan(0);

    run(world, 200);
    expect(count(world, El.SPLAT)).toBe(0); // every droplet landed (or flew off)
    expect(count(world, El.STAIN)).toBeGreaterThan(0);
    expect(count(world, El.ROCK)).toBe(rockBefore - removed); // stains never eat rock
  });

  it('has a ragged edge, not a perfect capsule', () => {
    const world = boxWorld(96, 64);
    fillRect(world, 0, 0, 95, 62, El.ROCK);
    stroke(world, 'slash', [[10, 30], [80, 30]], { radius: 5 });
    run(world, 3);
    let keptInside = 0;
    let cutOutside = 0;
    for (let x = 15; x <= 75; x++) {
      for (let y = 20; y <= 40; y++) {
        const d = Math.abs(y - 30);
        const cut = (world.flags[y * world.w + x] & Flag.CUT) !== 0;
        if (d < 5 && !cut) keptInside++;
        if (d > 5 && cut) cutOutside++;
      }
    }
    expect(keptInside).toBeGreaterThan(0);
    expect(cutOutside).toBeGreaterThan(0);
  });

  it('makes no droplets when the splatter flag is off', () => {
    flags.splatter = false;
    const world = boxWorld(96, 64);
    fillRect(world, 0, 20, 95, 62, El.ROCK);
    stroke(world, 'slash', [[10, 30], [80, 40, 15]], { radius: 4 });
    run(world, 50);
    expect(count(world, El.SPLAT) + count(world, El.STAIN)).toBe(0);
  });
});

describe('slash is a skill shot: aim, then release', () => {
  const cutAt = (world: World, x: number, y: number) => (world.flags[y * world.w + x] & Flag.CUT) !== 0;

  it('cuts nothing while aiming, then a straight line from press to release', () => {
    const world = boxWorld(128, 64);
    fillRect(world, 0, 10, 127, 62, El.ROCK);
    const before = count(world, El.ROCK);
    // a curvy drag: press at (10, 20), wander down to y=55, release at (110, 20)
    const driver = new ActionDriver();
    const tick = () => {
      driver.apply(world);
      step(world);
    };
    driver.begin('slash', { x: 10, y: 20, speed: 0 }, { radius: 3 });
    tick();
    for (const [x, y] of [[40, 50], [60, 55], [80, 50]]) {
      driver.move({ x, y, speed: 10 });
      tick();
    }
    expect(count(world, El.ROCK)).toBe(before); // aiming does nothing
    driver.move({ x: 110, y: 20, speed: 10 });
    tick();
    driver.end();
    tick();
    run(world, 5);
    expect(cutAt(world, 60, 20)).toBe(true); // on the straight line
    expect(cutAt(world, 60, 55)).toBe(false); // where the pointer wandered
    expect(cutAt(world, 5, 20)).toBe(false); // before the start
    expect(cutAt(world, 118, 20)).toBe(false); // past the end
  });

  it('sweeps along the line over a few ticks', () => {
    const world = boxWorld(256, 64);
    fillRect(world, 0, 10, 255, 62, El.ROCK);
    stroke(world, 'slash', [[10, 30], [250, 30]], { radius: 3 });
    run(world, 1);
    const early = [cutAt(world, 40, 30), cutAt(world, 230, 30)];
    run(world, 6);
    expect(early).toEqual([true, false]);
    expect(cutAt(world, 230, 30)).toBe(true);
  });

  it('is clamped to its range, and a plain click is cancelled', () => {
    const world = boxWorld(960, 64);
    fillRect(world, 0, 10, 959, 62, El.ROCK);
    const before = count(world, El.ROCK);
    stroke(world, 'slash', [[100, 30]], { radius: 3 }); // click
    run(world, 5);
    expect(count(world, El.ROCK)).toBe(before);
    stroke(world, 'slash', [[10, 30], [900, 30]], { radius: 3 });
    run(world, 30);
    expect(cutAt(world, 300, 30)).toBe(true);
    expect(cutAt(world, 10 + 360 + 10, 30)).toBe(false); // default range is 360 cells
  });
});

describe('null', () => {
  it('erases with no CUT flag, no splatter and no cut events', () => {
    const world = boxWorld(96, 64);
    fillRect(world, 0, 20, 95, 62, El.ROCK);
    const rockBefore = count(world, El.ROCK);
    let cuts = 0;
    world.events.on('cut', () => cuts++);
    stroke(world, 'null', [[10, 30], [80, 40, 15]], { radius: 4 });
    run(world, 3);
    expect(count(world, El.ROCK)).toBeLessThan(rockBefore - 300);
    expect(cutCells(world)).toBe(0);
    expect(cuts).toBe(0);
    run(world, 30);
    expect(count(world, El.SPLAT) + count(world, El.STAIN)).toBe(0);
  });
});

describe('acceptance: a slashed groove diverts water (PLAN.md section 7)', () => {
  /** A slope falling to the right; water poured near its top. */
  function slope(): World {
    const world = boxWorld(128, 72);
    for (let x = 0; x < 128; x++) {
      const top = Math.round(14 + x * 0.35);
      fillRect(world, x, top, x, 70, El.ROCK);
    }
    fillRect(world, 2, 2, 9, 8, El.WATER); // 56 cells
    return world;
  }

  const waterIn = (world: World, pred: (x: number, y: number) => boolean) => {
    let n = 0;
    for (let i = 0; i < world.size; i++) if (world.el[i] === El.WATER && pred(i % world.w, (i / world.w) | 0)) n++;
    return n;
  };

  it('without a groove water runs to the bottom; with one it collects in the groove', () => {
    const plain = slope();
    run(plain, 900);
    expect(waterIn(plain, (x) => x > 100)).toBeGreaterThan(40);

    const grooved = slope();
    // a diagonal cut starting at the surface around x=40 and diving steeper than the slope
    stroke(grooved, 'slash', [[38, 26], [50, 36], [62, 46], [70, 54]], { radius: 3 });
    run(grooved, 900);
    const inGroove = waterIn(grooved, (x, y) => (grooved.flags[y * grooved.w + x] & Flag.CUT) !== 0);
    expect(count(grooved, El.WATER)).toBe(56);
    expect(inGroove).toBeGreaterThan(45);
    expect(waterIn(grooved, (x) => x > 100)).toBeLessThan(5);
  });
});
