import { describe, expect, it } from 'vitest';
import { El } from '../src/core/elements';
import type { World } from '../src/core/world';
import { ActionDriver, type ActionLog } from '../src/core/replay';
import { BIRD_DEF } from '../src/sim/behaviors/bird';
import { BUTTERFLY_DEF } from '../src/sim/behaviors/butterfly';
import { ignite } from '../src/sim/behaviors/fire';
import { PERSON_DEF } from '../src/sim/behaviors/person';
import { ANCHOR, spawnCreature, type CreatureDef } from '../src/sim/creatures';
import { BIRD } from '../src/sim/elements/bird';
import { BUTTERFLY } from '../src/sim/elements/butterfly';
import { PERSON } from '../src/sim/elements/person';
import { step } from '../src/sim/step';
import { boxWorld, count, fillRect, rowsOf, run, stroke } from './sim-helpers';

/** Anchor cells (x, y) of a creature element. */
export function anchors(world: World, el: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < world.size; i++) if (world.el[i] === el && (world.aux[i] & ANCHOR) !== 0) out.push([i % world.w, (i / world.w) | 0]);
  return out;
}

/** Every cell of the creature must hang together: count anchors, and parts that point at one. */
export function intact(world: World, el: number): boolean {
  const a = anchors(world, el);
  let parts = 0;
  for (let i = 0; i < world.size; i++) {
    if (world.el[i] !== el || (world.aux[i] & ANCHOR) !== 0) continue;
    parts++;
    const ax = (i % world.w) + world.vx[i];
    const ay = ((i / world.w) | 0) + world.vy[i];
    if (!a.some(([x, y]) => x === ax && y === ay)) return false;
  }
  return a.length > 0 || parts === 0;
}

export function spawn(world: World, def: CreatureDef, x: number, y: number, variant = 0, face = 1): void {
  expect(spawnCreature(world, def, x, y, variant, face)).toBe(true);
}

describe('creatures (butterfly)', () => {
  it('spawns as one anchor plus parts, each pointing back at the anchor', () => {
    const world = boxWorld();
    spawn(world, BUTTERFLY_DEF, 30, 20, 2);
    expect(anchors(world, BUTTERFLY)).toEqual([[30, 20]]);
    expect(count(world, BUTTERFLY)).toBe(5);
    expect(intact(world, BUTTERFLY)).toBe(true);
    expect(world.owner[world.idx(30, 20)]).toBe(2); // variant lives on the anchor
  });

  it('flutters around on its own and stays in one piece, inside the canvas', () => {
    const world = boxWorld(96, 64);
    spawn(world, BUTTERFLY_DEF, 48, 30);
    const seen = new Set<string>();
    let minX = 99;
    let maxX = -1;
    for (let t = 0; t < 900; t++) {
      run(world, 1);
      const a = anchors(world, BUTTERFLY);
      expect(a.length).toBe(1);
      expect(intact(world, BUTTERFLY)).toBe(true);
      expect([3, 5]).toContain(count(world, BUTTERFLY)); // wings open or closed
      seen.add(a[0].join(','));
      minX = Math.min(minX, a[0][0]);
      maxX = Math.max(maxX, a[0][0]);
      expect(a[0][1]).toBeLessThan(world.h - 1);
    }
    expect(seen.size).toBeGreaterThan(40);
    expect(maxX - minX).toBeGreaterThan(5);
  });

  it('keeps off the ground it is flying over, and never touches rock', () => {
    const world = boxWorld(64, 40);
    fillRect(world, 10, 30, 50, 38, El.ROCK);
    const rock = count(world, El.ROCK);
    spawn(world, BUTTERFLY_DEF, 30, 25);
    for (let t = 0; t < 1200; t++) {
      run(world, 1);
      expect(intact(world, BUTTERFLY)).toBe(true);
    }
    expect(count(world, El.ROCK)).toBe(rock);
    expect(anchors(world, BUTTERFLY).length).toBe(1);
  });

  it('is deterministic', () => {
    const make = () => {
      const world = boxWorld(96, 64);
      spawn(world, BUTTERFLY_DEF, 48, 30, 3);
      spawn(world, BUTTERFLY_DEF, 20, 20, 1);
      run(world, 500);
      return world.hash();
    };
    expect(make()).toBe(make());
  });

  it('burns up when fire touches it', () => {
    const world = boxWorld();
    spawn(world, BUTTERFLY_DEF, 30, 20);
    world.set(31, 19, El.FIRE);
    run(world, 400);
    expect(count(world, BUTTERFLY)).toBe(0);
    expect(count(world, El.FIRE)).toBe(0);
  });

  it('flies away from fire it has not touched yet', () => {
    const world = boxWorld(120, 60);
    fillRect(world, 40, 50, 60, 58, El.TREE);
    world.set(39, 58, El.FIRE); // tree fire burning on the left
    spawn(world, BUTTERFLY_DEF, 56, 30);
    const startX = 56;
    run(world, 120);
    const [a] = anchors(world, BUTTERFLY);
    expect(a).toBeDefined();
    expect(a[0]).toBeGreaterThan(startX - 4); // not drawn toward the flames
  });

  it('bursts into flying ink when cut, leaving nothing of the creature behind', () => {
    const world = boxWorld();
    spawn(world, BUTTERFLY_DEF, 30, 20);
    // a slash clears whatever is in its way
    world.set(31, 20, El.EMPTY, { cut: true });
    run(world, 120);
    expect(count(world, BUTTERFLY)).toBe(0);
    expect(count(world, El.SPLAT) + count(world, El.STAIN)).toBeGreaterThan(0);
  });

  it('the paint brush spawns one per click and one every few cells along a drag', () => {
    const world = boxWorld(120, 60);
    stroke(world, 'paint', [[20, 20]], { el: BUTTERFLY, radius: 4 });
    expect(anchors(world, BUTTERFLY).length).toBe(1);
    const dragged = boxWorld(120, 60);
    stroke(dragged, 'paint', [[10, 20], [30, 20], [50, 20], [70, 20]], { el: BUTTERFLY, radius: 4 });
    expect(anchors(dragged, BUTTERFLY).length).toBeGreaterThanOrEqual(4);
    expect(anchors(dragged, BUTTERFLY).length).toBeLessThanOrEqual(8);
    expect(intact(dragged, BUTTERFLY)).toBe(true);
  });
});

describe('creatures (bird)', () => {
  it('spawns as a five-cell V with one anchor', () => {
    const world = boxWorld(120, 60);
    spawn(world, BIRD_DEF, 60, 20, 1);
    expect(anchors(world, BIRD)).toEqual([[60, 20]]);
    expect(count(world, BIRD)).toBe(5);
    expect(intact(world, BIRD)).toBe(true);
  });

  it('flies across the sky, flapping, staying whole and in the open air', () => {
    const world = boxWorld(200, 80);
    spawn(world, BIRD_DEF, 100, 30, 0, 1);
    let minX = 999;
    let maxX = -1;
    const frames = new Set<number>();
    for (let t = 0; t < 1500; t++) {
      run(world, 1);
      const a = anchors(world, BIRD);
      expect(a.length).toBe(1);
      expect(intact(world, BIRD)).toBe(true);
      frames.add(world.vy[world.idx(a[0][0], a[0][1])]);
      minX = Math.min(minX, a[0][0]);
      maxX = Math.max(maxX, a[0][0]);
      expect(a[0][1]).toBeGreaterThanOrEqual(8);
      expect(a[0][1]).toBeLessThanOrEqual(80 * 0.7 + 2);
    }
    expect(maxX - minX).toBeGreaterThan(60);
    expect(frames.size).toBe(3); // glide, down, up
  });

  it('turns around at a wall instead of flying through it', () => {
    const world = boxWorld(120, 50);
    fillRect(world, 60, 0, 61, 46, El.ROCK);
    const rock = count(world, El.ROCK);
    spawn(world, BIRD_DEF, 30, 25, 0, 1);
    let maxX = 0;
    for (let t = 0; t < 1500; t++) {
      run(world, 1);
      const a = anchors(world, BIRD);
      expect(a.length).toBe(1);
      maxX = Math.max(maxX, a[0][0]);
    }
    expect(maxX).toBeLessThan(59);
    expect(count(world, El.ROCK)).toBe(rock);
  });

  it('burns up when one of its cells catches fire', () => {
    const world = boxWorld(120, 60);
    spawn(world, BIRD_DEF, 60, 20);
    ignite(world, 62, 19);
    run(world, 300);
    expect(count(world, BIRD)).toBe(0);
    expect(count(world, El.FIRE)).toBe(0);
  });
});

describe('creatures (person)', () => {
  const personCells = (world: World) => count(world, PERSON);

  it('is a 24-cell figure in a straw hat, and falls to the ground when spawned in the air', () => {
    const world = boxWorld(120, 60);
    spawn(world, PERSON_DEF, 60, 10, 0, 1);
    expect(personCells(world)).toBe(24);
    expect(intact(world, PERSON)).toBe(true);
    run(world, 80);
    expect(intact(world, PERSON)).toBe(true);
    expect(rowsOf(world, PERSON).bottom).toBe(world.h - 2); // feet on the rock floor (row h - 1)
    expect(rowsOf(world, PERSON).top).toBe(world.h - 2 - 6); // 7 cells tall, hat on top
  });

  it('wanders along the ground on its own, staying whole, then pauses and moves on', () => {
    const world = boxWorld(240, 60);
    spawn(world, PERSON_DEF, 120, 10, 2, 1);
    let minX = 999;
    let maxX = -1;
    let idleTicks = 0;
    let walkTicks = 0;
    for (let t = 0; t < 2400; t++) {
      run(world, 1);
      const a = anchors(world, PERSON);
      expect(a.length).toBe(1);
      expect(intact(world, PERSON)).toBe(true);
      expect([23, 24]).toContain(personCells(world)); // legs apart or together
      if (t > 60) {
        minX = Math.min(minX, a[0][0]);
        maxX = Math.max(maxX, a[0][0]);
        expect(a[0][1]).toBe(world.h - 3); // always standing on the floor
        if (world.vy[world.idx(a[0][0], a[0][1])] === 2) idleTicks++;
        else walkTicks++;
      }
    }
    expect(maxX - minX).toBeGreaterThan(20);
    expect(idleTicks).toBeGreaterThan(200);
    expect(walkTicks).toBeGreaterThan(200);
  });

  it('turns back at walls: paces inside a corridor and never goes through', () => {
    const world = boxWorld(160, 60);
    fillRect(world, 70, 30, 72, 58, El.ROCK); // walls taller than any step
    fillRect(world, 108, 30, 110, 58, El.ROCK);
    const rock = count(world, El.ROCK);
    spawn(world, PERSON_DEF, 90, 40, 0, 1);
    let minX = 999;
    let maxX = 0;
    for (let t = 0; t < 4000; t++) {
      run(world, 1);
      const a = anchors(world, PERSON);
      expect(a.length).toBe(1);
      expect(intact(world, PERSON)).toBe(true);
      minX = Math.min(minX, a[0][0]);
      maxX = Math.max(maxX, a[0][0]);
    }
    expect(minX).toBeGreaterThan(72); // never inside the left wall
    expect(maxX).toBeLessThan(108); // or the right one
    expect(maxX - minX).toBeGreaterThan(20); // it did pace about
    expect(count(world, El.ROCK)).toBe(rock);
  });

  it('does not walk off a cliff: paces along a high platform and stays on it', () => {
    const world = boxWorld(160, 60);
    fillRect(world, 70, 40, 100, 58, El.ROCK); // a platform 19 cells above the floor; its surface is row 40
    spawn(world, PERSON_DEF, 85, 20, 0, 1);
    run(world, 60); // let it land
    let minX = 999;
    let maxX = 0;
    for (let t = 0; t < 4000; t++) {
      run(world, 1);
      const a = anchors(world, PERSON);
      expect(a.length).toBe(1);
      expect(a[0][1]).toBe(38); // feet on the platform (anchor is two rows above the surface)
      minX = Math.min(minX, a[0][0]);
      maxX = Math.max(maxX, a[0][0]);
    }
    expect(maxX - minX).toBeGreaterThan(15); // it did go along the platform
  });

  it('steps up onto a low ledge', () => {
    const world = boxWorld(200, 60);
    fillRect(world, 96, 20, 97, 58, El.ROCK); // a wall behind it, so it keeps coming back this way
    fillRect(world, 112, 57, 199, 58, El.ROCK); // a 2-cell-high ledge on the right (surface row 57)
    spawn(world, PERSON_DEF, 105, 20, 0, 1);
    let climbed = false;
    for (let t = 0; t < 4000 && !climbed; t++) {
      run(world, 1);
      const a = anchors(world, PERSON)[0];
      climbed = a[0] > 118 && a[1] === 55;
    }
    expect(climbed).toBe(true);
    expect(intact(world, PERSON)).toBe(true);
  });

  it('falls when the ground under it is taken away, and lands unhurt', () => {
    const world = boxWorld(100, 60);
    fillRect(world, 30, 40, 70, 58, El.ROCK);
    spawn(world, PERSON_DEF, 50, 20, 0, 1);
    run(world, 40);
    expect(anchors(world, PERSON)[0][1]).toBe(38);
    fillRect(world, 40, 40, 60, 58, El.EMPTY); // dig out the middle
    run(world, 120);
    expect(intact(world, PERSON)).toBe(true);
    expect(anchors(world, PERSON)[0][1]).toBeGreaterThan(50);
  });

  it('burns up when its hat catches fire', () => {
    const world = boxWorld(100, 60);
    spawn(world, PERSON_DEF, 50, 10, 1, 1);
    run(world, 60);
    const [ax, ay] = anchors(world, PERSON)[0];
    ignite(world, ax, ay - 5); // the tip of the hat
    run(world, 600);
    expect(personCells(world)).toBe(0);
    expect(count(world, El.FIRE)).toBe(0);
  });

  it('bursts into ink when cut in half', () => {
    const world = boxWorld(100, 60);
    spawn(world, PERSON_DEF, 50, 10, 1, 1);
    run(world, 60);
    const [ax, ay] = anchors(world, PERSON)[0];
    world.set(ax, ay - 2, El.EMPTY, { cut: true }); // through the neck
    run(world, 200);
    expect(personCells(world)).toBe(0);
    expect(count(world, El.SPLAT) + count(world, El.STAIN)).toBeGreaterThan(5);
  });

  it('runs away from nearby fire, even when it was walking toward it', () => {
    const world = boxWorld(200, 60);
    // a bonfire that keeps burning: burning wood with a long life
    for (let x = 70; x <= 74; x++) for (let y = 52; y <= 58; y++) world.set(x, y, El.FIRE, { aux: El.TREE, life: 250 });
    spawn(world, PERSON_DEF, 88, 20, 0, -1); // facing the fire, 14 cells away
    run(world, 30);
    const start = anchors(world, PERSON)[0][0];
    run(world, 100);
    const a = anchors(world, PERSON);
    expect(a.length).toBe(1);
    expect(a[0][0]).toBeGreaterThan(start + 12);
    expect(intact(world, PERSON)).toBe(true);
  });
});

describe('creatures together', () => {
  it('a crowd of every kind keeps every creature whole and the counts steady', () => {
    const world = boxWorld(240, 90);
    for (let k = 0; k < 4; k++) spawn(world, PERSON_DEF, 30 + k * 50, 30, k, k % 2 ? 1 : -1);
    for (let k = 0; k < 4; k++) spawn(world, BIRD_DEF, 20 + k * 55, 15 + k * 4, k);
    for (let k = 0; k < 6; k++) spawn(world, BUTTERFLY_DEF, 15 + k * 38, 40, k);
    for (let t = 0; t < 1500; t++) {
      run(world, 1);
      if (t % 25 !== 0) continue;
      expect(anchors(world, PERSON).length).toBe(4);
      expect(anchors(world, BIRD).length).toBe(4);
      expect(anchors(world, BUTTERFLY).length).toBe(6);
      for (const el of [PERSON, BIRD, BUTTERFLY]) expect(intact(world, el)).toBe(true);
      expect(count(world, PERSON)).toBeGreaterThanOrEqual(4 * 23);
      expect(count(world, PERSON)).toBeLessThanOrEqual(4 * 24);
      expect(count(world, BIRD)).toBe(20);
    }
  });

  it('a brush session that spawns creatures replays to the same hash', () => {
    const live = boxWorld(200, 80, 9);
    const driver = new ActionDriver();
    const at = (x: number, y: number) => ({ x, y, speed: 3 });
    for (let t = 0; t < 400; t++) {
      if (t === 2) driver.begin('paint', at(30, 30), { el: PERSON, radius: 4 });
      if (t === 3) driver.move(at(120, 30));
      if (t === 4) driver.end();
      if (t === 20) driver.begin('paint', at(40, 20), { el: BIRD, radius: 4 });
      if (t === 21) driver.move(at(150, 22));
      if (t === 22) driver.end();
      if (t === 40) driver.begin('paint', at(60, 40), { el: BUTTERFLY, radius: 4 });
      if (t === 41) driver.move(at(100, 40));
      if (t === 42) driver.end();
      driver.apply(live);
      step(live);
    }
    expect(anchors(live, PERSON).length).toBeGreaterThanOrEqual(2);
    const log = JSON.parse(JSON.stringify(driver.log)) as ActionLog;

    const replay = boxWorld(200, 80, 9);
    const player = new ActionDriver(log);
    while (replay.tick < live.tick) {
      player.apply(replay);
      step(replay);
    }
    expect(replay.hash()).toBe(live.hash());
  });
});
