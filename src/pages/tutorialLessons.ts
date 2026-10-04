/**
 * The tutorial's lessons: one small hand-built scene per ability, each made to show what that
 * stroke does best. A lesson builds its scene into a fresh World, reports how close the player is
 * to its goal, and carries the stroke that solves it (the page's "Show me" plays it, and the tests
 * prove every lesson can be solved). No DOM in here.
 */
import type { AbilityId } from '../core/abilities';
import { El } from '../core/elements';
import type { LevelDims } from '../core/constants';
import type { World } from '../core/world';
import { LEAF } from '../sim/elements/leaf';

export const TUTORIAL_DIMS: LevelDims = { w: 480, h: 180 };
export const TUTORIAL_SEED = 7;

/** Surface row of the valley floor. */
const FLOOR = TUTORIAL_DIMS.h - 14;

export type Box = [x0: number, y0: number, x1: number, y1: number];

/** A stroke: press at `from`, drag to `to`, hold for `hold` ticks (charge), release. */
export interface Stroke {
  from: [number, number];
  to: [number, number];
  hold: number;
}

export interface Lesson {
  ability: AbilityId;
  /** The lesson's name, e.g. "Cut it loose". */
  title: string;
  /** What to do, as the player reads it. */
  teach: string;
  /** The goal in a few words, shown with the progress bar. */
  goal: string;
  /** Brush size the lesson starts with (big enough to do the job). */
  radius: number;
  /** Where the thing to change is: outlined on the painting until the lesson is done. */
  target: Box;
  build(world: World): void;
  /** 0..1, how far along the goal is; 1 = done. */
  progress(world: World): number;
  /** The strokes that solve it, one after another. */
  solution: Stroke[];
}

// ---- scene helpers ----

function fill(world: World, x: number, y0: number, y1: number, el: number = El.ROCK): void {
  for (let y = Math.max(0, Math.round(y0)); y <= Math.min(world.h - 1, Math.round(y1)); y++) world.set(x, y, el, { aux: world.rng.int(256) });
}

/** A rock floor across the whole scroll, surface at FLOOR. */
function floor(world: World): void {
  for (let x = 0; x < world.w; x++) fill(world, x, FLOOR, world.h - 1);
}

/** A small tree: a trunk standing on row `base` and a round canopy of leaves. */
function tree(world: World, x: number, base: number, height: number): void {
  for (let y = base - height; y < base; y++) world.set(x, y, El.TREE, { aux: world.rng.int(256) });
  world.forCircle(x, base - height, Math.max(3, Math.round(height * 0.4)), (cx, cy) => {
    if (world.el[cy * world.w + cx] === El.EMPTY) world.set(cx, cy, LEAF, { aux: world.rng.int(256) });
  });
}

function count(world: World, box: Box, test: (el: number) => boolean): number {
  const [x0, y0, x1, y1] = box;
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (test(world.el[y * world.w + x])) n++;
  return n;
}

const isRock = (e: number) => e === El.ROCK;
const isWood = (e: number) => e === El.TREE || e === LEAF;

/** Progress toward removing what `test` finds in `box`: done once at most `keep` of it is left. */
function clearing(box: Box, test: (el: number) => boolean, keep: number): { measure(world: World): void; progress(world: World): number } {
  let initial = 1;
  return {
    /** Call once the scene is built: how much there is to clear. */
    measure(world) {
      initial = Math.max(1, count(world, box, test));
    },
    progress(world) {
      const gone = 1 - count(world, box, test) / initial;
      return Math.max(0, Math.min(1, gone / (1 - keep)));
    },
  };
}

// ---- the lessons ----

/** 斬: a stone slab juts out over the valley on a thin neck. Cut the neck and it falls. */
const SLAB: Box = [216, 60, 330, 84];
const slabGoal = clearing(SLAB, isRock, 0.15);
const slash: Lesson = {
  ability: 'slash',
  title: 'Cut it loose',
  teach: 'A stone slab hangs over the valley by a thin neck. Drag a line across the neck and let go: the blade cuts rock and wood, and whatever you cut loose falls.',
  goal: 'Drop the slab into the valley',
  radius: 4,
  target: SLAB,
  build(world) {
    floor(world);
    for (let x = 0; x < 200; x++) fill(world, x, 60, FLOOR); // the cliff
    for (let x = 200; x < 216; x++) fill(world, x, 66, 78); // the neck
    for (let x = 216; x <= 330; x++) fill(world, x, 60 + (x > 300 ? (x - 300) / 3 : 0), 84 - (x > 290 ? (x - 290) / 4 : 0)); // the slab, tapering
    for (const x of [40, 95, 150]) tree(world, x, 60, 18 + (x % 7));
    tree(world, 420, FLOOR, 22);
    slabGoal.measure(world);
  },
  progress: (world) => slabGoal.progress(world),
  solution: [{ from: [208, 52], to: [208, 92], hold: 10 }],
};

/** 推: a boulder rests on a ledge above a pond. Push it off. */
const BOULDER: Box = [185, 74, 207, 95];
const boulderGoal = clearing(BOULDER, isRock, 0.3);
const push: Lesson = {
  ability: 'push',
  title: 'Hurl the boulder',
  teach: 'Push throws whatever is under the line in the direction you drag. Start the line behind the boulder and drag toward the pond.',
  goal: 'Knock the boulder off the ledge',
  radius: 12,
  target: BOULDER,
  build(world) {
    floor(world);
    for (let x = 0; x < 220; x++) fill(world, x, 96, FLOOR); // the ledge
    for (let x = 300; x <= 420; x++) {
      const depth = Math.round(10 * Math.sqrt(1 - ((x - 360) / 61) ** 2));
      for (let y = FLOOR; y < FLOOR + depth; y++) world.set(x, y, El.WATER, { aux: world.rng.int(256) });
    }
    world.forCircle(196, 85, 10, (x, y) => {
      if (y < 96) world.set(x, y, El.ROCK, { aux: world.rng.int(256) });
    });
    for (const x of [30, 80, 125]) tree(world, x, 96, 16 + (x % 9));
    tree(world, 450, FLOOR, 20);
    boulderGoal.measure(world);
  },
  progress: (world) => boulderGoal.progress(world),
  solution: [{ from: [170, 90], to: [262, 78], hold: 45 }],
};

/** 火: a grove of trees. Set it alight and let the fire spread. */
const GROVE: Box = [140, FLOOR - 44, 340, FLOOR - 1];
const groveGoal = clearing(GROVE, isWood, 0.3);
const fire: Lesson = {
  ability: 'fire',
  title: 'Kindle the grove',
  teach: 'Fire lights wood and leaves along the line, then spreads on its own. Draw it through the canopy and watch the grove burn.',
  goal: 'Burn most of the grove',
  radius: 5,
  target: GROVE,
  build(world) {
    floor(world);
    for (let x = 160, k = 0; x <= 320; x += 20, k++) tree(world, x, FLOOR, 22 + ((k * 7) % 9));
    groveGoal.measure(world);
  },
  progress: (world) => groveGoal.progress(world),
  solution: [{ from: [150, FLOOR - 26], to: [330, FLOOR - 26], hold: 20 }],
};

/** 水: a dry basin. Fill it. */
const BASIN: Box = [160, FLOOR, 320, FLOOR + 11];
const BASIN_CELLS = (BASIN[2] - BASIN[0] + 1) * (BASIN[3] - BASIN[1] + 1);
const water: Lesson = {
  ability: 'water',
  title: 'Fill the pond',
  teach: 'Water drops a sheet of water along the line. It runs downhill, pools in hollows, and puts out fire. Pour it over the dry basin until it is full.',
  goal: 'Fill the basin',
  radius: 8,
  target: [BASIN[0], BASIN[1] - 4, BASIN[2], BASIN[3]],
  build(world) {
    floor(world);
    for (let x = BASIN[0]; x <= BASIN[2]; x++) for (let y = BASIN[1]; y <= BASIN[3]; y++) world.set(x, y, El.EMPTY); // dig it
    for (const x of [70, 110, 380, 430]) tree(world, x, FLOOR, 18 + (x % 8));
  },
  progress: (world) => Math.min(1, count(world, BASIN, (e) => e === El.WATER) / (BASIN_CELLS * 0.4)),
  solution: [
    { from: [168, FLOOR - 30], to: [312, FLOOR - 30], hold: 45 },
    { from: [168, FLOOR - 40], to: [312, FLOOR - 40], hold: 45 },
  ],
};

/** 無: a wall of rock. Erase it without a trace. */
const WALL: Box = [232, FLOOR - 90, 252, FLOOR - 1];
const wallGoal = clearing(WALL, isRock, 0.15);
const erase: Lesson = {
  ability: 'null',
  title: 'Erase the wall',
  teach: 'Null quietly wipes away everything under the line: no scar, no splatter. One stroke down the wall clears the way.',
  goal: 'Erase the wall',
  radius: 12,
  target: WALL,
  build(world) {
    floor(world);
    for (let x = WALL[0]; x <= WALL[2]; x++) fill(world, x, WALL[1], FLOOR);
    for (const x of [90, 150, 330, 400]) tree(world, x, FLOOR, 18 + (x % 9));
    wallGoal.measure(world);
  },
  progress: (world) => wallGoal.progress(world),
  solution: [{ from: [242, FLOOR - 100], to: [242, FLOOR - 2], hold: 0 }],
};

export const LESSONS: Lesson[] = [slash, push, fire, water, erase];
