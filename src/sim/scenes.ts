import { El } from '../core/elements';
import type { World } from '../core/world';
import { EARTH } from './elements/earth';
import { LEAF } from './elements/leaf';

/** Hand-built test scenes for the sandbox, so sim work never waits on the generator. */
export interface Scene {
  id: string;
  name: string;
  build(world: World): void;
}

/** Fill column x from row `top` down to the bottom with `el`. */
function column(world: World, x: number, top: number, el: number = El.ROCK): void {
  for (let y = Math.max(0, Math.round(top)); y < world.h; y++) world.set(x, y, el, { aux: world.rng.int(256) });
}

/** A rock floor `ground` cells thick, returning the surface row. */
function ground(world: World, ground = 10): number {
  const top = world.h - ground;
  for (let x = 0; x < world.w; x++) column(world, x, top);
  return top;
}

/** A small tree (wooden trunk + leafy canopy) standing on row `base`. */
function tree(world: World, x: number, base: number, height = 14): void {
  for (let y = base - height; y < base; y++) world.set(x, y, El.TREE, { aux: world.rng.int(256) });
  world.forCircle(x, base - height, Math.max(3, height * 0.4), (cx, cy) => {
    if (world.el[cy * world.w + cx] !== El.TREE) world.set(cx, cy, LEAF, { aux: world.rng.int(256) });
  });
}

export const SCENES: Scene[] = [
  {
    id: 'steep',
    name: 'Steep mountain',
    build: (world) => {
      const top = ground(world);
      const cx = world.w / 2;
      const half = world.w * 0.18;
      const height = world.h * 0.75;
      for (let x = Math.floor(cx - half); x <= cx + half; x++) column(world, x, top - height * (1 - Math.abs(x - cx) / half));
    },
  },
  {
    id: 'valley',
    name: 'Valley',
    build: (world) => {
      const floor = world.h - 12;
      for (let x = 0; x < world.w; x++) {
        const t = Math.abs(x - world.w / 2) / (world.w / 2); // 0 at the center, 1 at the edges
        column(world, x, floor - world.h * 0.6 * t * t);
      }
    },
  },
  {
    id: 'trees',
    name: 'Row of trees',
    build: (world) => {
      const top = ground(world);
      for (let x = 40; x < world.w * 0.55; x += 9) tree(world, x, top, 12 + ((x * 7) % 9));
      const wall = Math.round(world.w * 0.58);
      for (let x = wall; x < wall + 6; x++) column(world, x, top - world.h * 0.6);
      for (let x = wall + 20; x < world.w - 30; x += 9) tree(world, x, top, 12 + ((x * 5) % 9));
    },
  },
  {
    id: 'plateau',
    name: 'Flat plateau',
    build: (world) => {
      const top = ground(world);
      const x0 = world.w * 0.25;
      const x1 = world.w * 0.75;
      const height = world.h * 0.45;
      for (let x = Math.floor(x0 - 40); x <= x1 + 40; x++) {
        const edge = x < x0 ? (x - (x0 - 40)) / 40 : x > x1 ? (x1 + 40 - x) / 40 : 1;
        column(world, x, top - height * edge);
      }
    },
  },
  {
    id: 'pond',
    name: 'Pond and earth',
    build: (world) => {
      const top = ground(world);
      const x0 = Math.round(world.w * 0.3);
      const x1 = Math.round(world.w * 0.7);
      for (let x = x0; x <= x1; x++) for (let y = top; y < top + 8; y++) world.set(x, y, El.EMPTY); // dig the basin
      for (let x = x0; x <= x1; x++) for (let y = top + 1; y < top + 8; y++) world.set(x, y, El.WATER, { aux: world.rng.int(256) });
      const cx = world.w * 0.15;
      for (let x = Math.floor(cx - 50); x <= cx + 50; x++) {
        const hgt = 40 * (1 - Math.abs(x - cx) / 50);
        for (let y = Math.round(top - hgt); y < top; y++) world.set(x, y, EARTH, { aux: world.rng.int(256) });
      }
    },
  },
];
