import { describe, expect, it } from 'vitest';
import { El } from '../src/core/elements';
import type { World } from '../src/core/world';
import { ANCHOR, spawnCreature, type CreatureDef } from '../src/sim/creatures';
import { BUTTERFLY_DEF } from '../src/sim/behaviors/butterfly';
import { BUTTERFLY } from '../src/sim/elements/butterfly';
import { boxWorld, count, fillRect, run, stroke } from './sim-helpers';

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
