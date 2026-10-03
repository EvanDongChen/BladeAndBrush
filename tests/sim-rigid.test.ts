import { describe, expect, it } from 'vitest';
import { flags } from '../src/core/config';
import { El } from '../src/core/elements';
import type { World } from '../src/core/world';
import { bodyCount, markUnsupported } from '../src/sim/behaviors/rigid';
import { DUST } from '../src/sim/elements/dust';
import { LEAF } from '../src/sim/elements/leaf';
import { boxWorld, count, fillRect, rowsOf, run, stroke } from './sim-helpers';

/** Bounding box of `el` cells above the floor row. */
function bbox(world: World, el: number) {
  let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
  for (let i = 0; i < world.size - world.w; i++) {
    if (world.el[i] !== el) continue;
    const x = i % world.w;
    const y = (i / world.w) | 0;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0, x1, y0, y1 };
}

describe('rigid pieces', () => {
  it('a floating block falls as one piece, keeps its shape, and lands on the floor', () => {
    const world = boxWorld();
    fillRect(world, 10, 5, 19, 9, El.ROCK); // 10 x 5 block in the air
    markUnsupported(world);
    run(world, 120);
    expect(bodyCount(world)).toBe(0);
    expect(bbox(world, El.ROCK)).toEqual({ x0: 10, x1: 19, y0: 42, y1: 46 });
    expect(count(world, El.ROCK)).toBe(64 + 50);
  });

  it('a hard landing kicks up dust and emits an impact; small pieces crumble but nothing is lost', () => {
    const world = boxWorld(64, 64);
    fillRect(world, 10, 2, 25, 9, El.ROCK); // big piece, high up
    fillRect(world, 45, 2, 47, 4, El.ROCK); // tiny 3x3 piece
    const rock = count(world, El.ROCK);
    const impacts: number[] = [];
    world.events.on('impact', (e) => impacts.push(e.strength));
    markUnsupported(world);
    let sawDust = false;
    for (let t = 0; t < 300; t++) {
      run(world, 1);
      sawDust ||= count(world, DUST) > 0;
    }
    expect(sawDust).toBe(true);
    expect(impacts.length).toBeGreaterThan(0);
    expect(Math.max(...impacts)).toBeGreaterThan(100);
    expect(count(world, El.ROCK)).toBe(rock);
    expect(bodyCount(world)).toBe(0);
    // the big piece kept its shape; the tiny one broke up (no 3x3 block left at its landing spot)
    expect(bbox(world, El.ROCK)).toMatchObject({ y1: 62 });
    let tinyBlock = true;
    for (let y = 60; y <= 62; y++) for (let x = 45; x <= 47; x++) tinyBlock &&= world.el[y * 64 + x] === El.ROCK;
    expect(tinyBlock).toBe(false);
  });

  it('anything still connected to the ground stays put', () => {
    const world = boxWorld();
    fillRect(world, 10, 20, 12, 46, El.ROCK); // pillar on the floor
    fillRect(world, 13, 20, 30, 22, El.ROCK); // overhang attached to it
    markUnsupported(world);
    run(world, 30);
    expect(bodyCount(world)).toBe(0);
    expect(bbox(world, El.ROCK)).toEqual({ x0: 10, x1: 30, y0: 20, y1: 46 });
    expect(count(world, El.ROCK)).toBe(64 + 3 * 27 + 18 * 3);
  });

  it('slashing through a pillar drops what it held', () => {
    const world = boxWorld(64, 64);
    fillRect(world, 28, 30, 35, 62, El.ROCK); // pillar
    fillRect(world, 18, 26, 45, 29, El.ROCK); // slab on top
    stroke(world, 'slash', [[20, 45], [44, 45]], { radius: 3 });
    run(world, 200);
    expect(bodyCount(world)).toBe(0);
    // the slab came down by roughly the groove's width and is still one flat 28-wide slab
    const slab = bbox(world, El.ROCK);
    expect(slab.x1 - slab.x0).toBe(27); // same width (it may slide a cell on the ragged cut)
    expect(Math.abs(slab.x0 - 18)).toBeLessThanOrEqual(2);
    let slabRow = -1;
    for (let y = 0; y < 64 && slabRow < 0; y++) if (world.el[y * 64 + slab.x0] === El.ROCK) slabRow = y;
    expect(slabRow).toBeGreaterThan(29);
  });

  it('a piece cut on a slant slides off down the cut', () => {
    const world = boxWorld(96, 64);
    for (let x = 20; x < 76; x++) fillRect(world, x, 62 - Math.min(x - 20, 75 - x), x, 62, El.ROCK); // a pyramid
    const rock = count(world, El.ROCK);
    stroke(world, 'slash', [[30, 34], [55, 44], [80, 54]], { radius: 2 }); // slanted cut through the top
    run(world, 2); // let the released cut sweep through
    const cut = count(world, El.ROCK);
    const topBefore = rowsOf(world, El.ROCK).top;
    run(world, 300);
    expect(bodyCount(world)).toBe(0);
    expect(count(world, El.ROCK)).toBe(cut);
    expect(cut).toBeLessThan(rock);
    expect(rowsOf(world, El.ROCK).top).toBeGreaterThan(topBefore + 3); // the tip came down
  });

  it('a piece dropped into a pond sinks and pushes the water up, losing nothing', () => {
    const world = boxWorld(64, 64);
    fillRect(world, 10, 40, 10, 62, El.ROCK);
    fillRect(world, 50, 40, 50, 62, El.ROCK);
    fillRect(world, 11, 50, 49, 62, El.WATER);
    const water = count(world, El.WATER);
    fillRect(world, 25, 5, 34, 9, El.ROCK);
    markUnsupported(world);
    run(world, 300);
    expect(count(world, El.WATER)).toBe(water);
    expect(rowsOf(world, El.ROCK).bottom).toBe(63);
    const block = bbox(world, El.ROCK);
    expect(block.y1).toBe(62); // walls reach 62 too, so check the block sits on the floor:
    let blockCells = 0;
    for (let y = 58; y <= 62; y++) for (let x = 25; x <= 34; x++) if (world.el[y * 64 + x] === El.ROCK) blockCells++;
    expect(blockCells).toBe(50);
  });

  it('erasing a trunk drops the canopy', () => {
    const world = boxWorld();
    fillRect(world, 30, 28, 30, 46, El.TREE);
    world.forCircle(30, 26, 4, (x, y) => world.el[y * world.w + x] === El.EMPTY && world.set(x, y, LEAF));
    const leaves = count(world, LEAF);
    const top = rowsOf(world, LEAF).top;
    stroke(world, 'null', [[24, 44], [36, 44]], { radius: 2 });
    run(world, 200);
    expect(count(world, LEAF)).toBe(leaves);
    expect(rowsOf(world, LEAF).top).toBeGreaterThan(top + 3);
  });

  it('a trunk that burns away drops the canopy', () => {
    flags.fireSpread = false; // only the one cell burns
    try {
      const world = boxWorld();
      fillRect(world, 30, 30, 30, 46, El.TREE);
      world.forCircle(30, 28, 4, (x, y) => world.el[y * world.w + x] === El.EMPTY && world.set(x, y, LEAF));
      const top = rowsOf(world, LEAF).top;
      world.set(30, 46, El.FIRE, { aux: El.TREE, life: 5 });
      run(world, 100);
      expect(rowsOf(world, LEAF).top).toBe(top + 1);
    } finally {
      flags.fireSpread = true;
    }
  });
});
