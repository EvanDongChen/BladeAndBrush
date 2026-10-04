/**
 * The tutorial's lessons. Most are a small hand-built scene made to show one thing at its best:
 * a stroke of the blade (slash, push, fire, water, null) or a knob of the Nature panel (wind,
 * gravity). The last one is a real generated painting, shaped with the mountain graph.
 *
 * A lesson reports how close the player is to its goal and carries its own solution (the page's
 * "Show me" plays it, and the tests prove every lesson can be solved). No DOM in here.
 */
import type { AbilityId } from '../core/abilities';
import { DEFAULT_DIMS, type LevelDims } from '../core/constants';
import { El } from '../core/elements';
import type { GenParams } from '../core/params';
import type { ScanResult } from '../core/scan';
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

interface LessonBase {
  /** Short name in the lesson list, and the glyph beside it. */
  name: string;
  glyph: string;
  /** The lesson's heading, e.g. "Cut it loose". */
  title: string;
  /** What to do, as the player reads it. */
  teach: string;
  /** The goal in a few words, shown with the progress bar. */
  goal: string;
}

/** Learn a stroke of the blade on a hand-built scene. */
export interface StrokeLesson extends LessonBase {
  kind: 'stroke';
  ability: AbilityId;
  /** Brush size the lesson uses. */
  radius: number;
  /** Where the thing to change is: outlined on the painting until the lesson is done. */
  target: Box;
  build(world: World): void;
  /** 0..1, how far along the goal is; 1 = done. */
  progress(world: World): number;
  /** The strokes that solve it, one after another. */
  solution: Stroke[];
}

/** The Nature panel's knobs, as the world's params. */
export interface Nature {
  gravity?: number;
  wind?: number;
  windY?: number;
}

/** Learn a knob of the Nature panel (the wind compass or the gravity gauge) on a hand-built scene. */
export interface NatureLesson extends LessonBase {
  kind: 'nature';
  control: 'wind' | 'gravity';
  target: Box;
  build(world: World): void;
  progress(world: World): number;
  /** Where to set the knob. */
  solution: Nature;
}

/** Learn the mountain graph on a real generated painting: shape it, Redraw, and it is scanned. */
export interface GraphLesson extends LessonBase {
  kind: 'graph';
  dims: LevelDims;
  seed: number;
  /** Params the painting starts with (the rest are defaults). */
  params: Partial<GenParams>;
  /** 0..1 from the scan of the redrawn painting. */
  progress(scan: ScanResult): number;
  /** Mountain height (the red line) that solves it. */
  solution: { mountainHeight: number };
}

export type Lesson = StrokeLesson | NatureLesson | GraphLesson;

// ---- scene helpers ----

function fill(world: World, x: number, y0: number, y1: number, el: number = El.ROCK): void {
  for (let y = Math.max(0, Math.round(y0)); y <= Math.min(world.h - 1, Math.round(y1)); y++) world.set(x, y, el, { aux: world.rng.int(256) });
}

function block(world: World, x0: number, x1: number, y0: number, y1: number, el: number = El.ROCK): void {
  for (let x = x0; x <= x1; x++) fill(world, x, y0, y1, el);
}

/** A rock floor across the whole scroll, surface at FLOOR. */
function floor(world: World): void {
  block(world, 0, world.w - 1, FLOOR, world.h - 1);
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
const isWater = (e: number) => e === El.WATER;

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

/** Progress toward getting `share` of all the water on the scroll into `box`. */
function gathering(box: Box, share: number): { measure(world: World): void; progress(world: World): number } {
  let total = 1;
  return {
    measure(world) {
      total = Math.max(1, count(world, [0, 0, world.w - 1, world.h - 1], isWater));
    },
    progress: (world) => Math.min(1, count(world, box, isWater) / (total * share)),
  };
}

// ---- the strokes ----

/** 斬: a stone slab juts out over the valley on a thin neck. Cut the neck and it falls. */
const SLAB: Box = [216, 62, 330, 82];
const slabGoal = clearing(SLAB, isRock, 0.15);
const slash: StrokeLesson = {
  kind: 'stroke',
  ability: 'slash',
  name: 'Slash',
  glyph: '斬',
  title: 'Cut it loose',
  teach: 'A stone slab hangs over the valley by a thin neck. Drag a line across the neck and let go: the blade cuts rock and wood, and whatever you cut loose falls.',
  goal: 'Drop the slab into the valley',
  radius: 3,
  target: SLAB,
  build(world) {
    floor(world);
    block(world, 0, 199, 60, FLOOR); // the cliff
    block(world, 200, 215, 68, 76); // the neck
    for (let x = 216; x <= 330; x++) fill(world, x, 62 + (x > 300 ? (x - 300) / 3 : 0), 82 - (x > 290 ? (x - 290) / 4 : 0)); // the slab, tapering
    for (const x of [40, 95, 150]) tree(world, x, 60, 18 + (x % 7));
    tree(world, 420, FLOOR, 22);
    slabGoal.measure(world);
  },
  progress: (world) => slabGoal.progress(world),
  solution: [{ from: [208, 58], to: [208, 88], hold: 10 }],
};

/** 推: a boulder rests on a ledge above a pond. Push it off. */
const BOULDER: Box = [188, 82, 204, 95];
const boulderGoal = clearing(BOULDER, isRock, 0.3);
const push: StrokeLesson = {
  kind: 'stroke',
  ability: 'push',
  name: 'Push',
  glyph: '推',
  title: 'Hurl the boulder',
  teach: 'Push throws whatever is under the line in the direction you drag. Start the line behind the boulder and drag toward the pond.',
  goal: 'Knock the boulder off the ledge',
  radius: 6,
  target: BOULDER,
  build(world) {
    floor(world);
    block(world, 0, 219, 96, FLOOR); // the ledge
    for (let x = 300; x <= 420; x++) fill(world, x, FLOOR, FLOOR + Math.round(10 * Math.sqrt(1 - ((x - 360) / 61) ** 2)) - 1, El.WATER);
    world.forCircle(196, 89, 7, (x, y) => {
      if (y < 96) world.set(x, y, El.ROCK, { aux: world.rng.int(256) });
    });
    for (const x of [30, 80, 125]) tree(world, x, 96, 16 + (x % 9));
    tree(world, 450, FLOOR, 20);
    boulderGoal.measure(world);
  },
  progress: (world) => boulderGoal.progress(world),
  solution: [{ from: [184, 90], to: [262, 80], hold: 45 }],
};

/** 火: a grove of trees. Set it alight and let the fire spread. */
const GROVE: Box = [140, FLOOR - 44, 340, FLOOR - 1];
const groveGoal = clearing(GROVE, isWood, 0.3);
const fire: StrokeLesson = {
  kind: 'stroke',
  ability: 'fire',
  name: 'Fire',
  glyph: '火',
  title: 'Kindle the grove',
  teach: 'Fire lights wood and leaves along the line, then spreads on its own. Draw it through the canopy and watch the grove burn.',
  goal: 'Burn most of the grove',
  radius: 3,
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
const BASIN: Box = [180, FLOOR, 300, FLOOR + 9];
const BASIN_CELLS = (BASIN[2] - BASIN[0] + 1) * (BASIN[3] - BASIN[1] + 1);
const water: StrokeLesson = {
  kind: 'stroke',
  ability: 'water',
  name: 'Water',
  glyph: '水',
  title: 'Fill the pond',
  teach: 'Water drops a sheet of water along the line. It runs downhill, pools in hollows, and puts out fire. Pour it over the dry basin until it is full; hold longer for a wider sheet.',
  goal: 'Fill the basin',
  radius: 5,
  target: [BASIN[0], BASIN[1] - 4, BASIN[2], BASIN[3]],
  build(world) {
    floor(world);
    block(world, BASIN[0], BASIN[2], BASIN[1], BASIN[3], El.EMPTY); // dig it
    for (const x of [70, 110, 380, 430]) tree(world, x, FLOOR, 18 + (x % 8));
  },
  progress: (world) => Math.min(1, count(world, BASIN, isWater) / (BASIN_CELLS * 0.4)),
  solution: [
    { from: [186, FLOOR - 30], to: [294, FLOOR - 30], hold: 45 },
    { from: [186, FLOOR - 42], to: [294, FLOOR - 42], hold: 45 },
    { from: [186, FLOOR - 54], to: [294, FLOOR - 54], hold: 45 },
  ],
};

/** 無: a wall of rock. Erase it without a trace. */
const WALL: Box = [237, FLOOR - 90, 247, FLOOR - 1];
const wallGoal = clearing(WALL, isRock, 0.15);
const erase: StrokeLesson = {
  kind: 'stroke',
  ability: 'null',
  name: 'Null',
  glyph: '無',
  title: 'Erase the wall',
  teach: 'Null quietly wipes away everything under the line: no scar, no splatter. One stroke down the wall clears the way.',
  goal: 'Erase the wall',
  radius: 6,
  target: WALL,
  build(world) {
    floor(world);
    block(world, WALL[0], WALL[2], WALL[1], FLOOR);
    for (const x of [90, 150, 330, 400]) tree(world, x, FLOOR, 18 + (x % 9));
    wallGoal.measure(world);
  },
  progress: (world) => wallGoal.progress(world),
  solution: [{ from: [242, FLOOR - 100], to: [242, FLOOR - 2], hold: 0 }],
};

// ---- the Nature panel ----

/** 風: a pond behind a low bank. A gale drives the water over it and into a basin downwind. */
const DOWNWIND: Box = [300, FLOOR - 12, 400, FLOOR + 9];
const downwindGoal = gathering(DOWNWIND, 0.35);
const wind: NatureLesson = {
  kind: 'nature',
  control: 'wind',
  name: 'Wind',
  glyph: '風',
  title: 'Blow the pond across',
  teach: 'The wind compass sets which way the wind blows and how hard: the arrow points downwind, and the rim is a gale. Water, clouds, smoke, birds and villagers all lean with it. Aim a strong wind east to drive the pond over its bank and into the basin.',
  goal: 'Blow the water into the basin',
  target: DOWNWIND,
  build(world) {
    floor(world);
    block(world, 30, 35, FLOOR - 16, FLOOR - 1); // back wall
    block(world, 141, 144, FLOOR - 10, FLOOR - 1); // the low bank
    block(world, 36, 140, FLOOR - 8, FLOOR - 1, El.WATER);
    block(world, 300, 400, FLOOR, FLOOR + 9, El.EMPTY); // the basin
    block(world, 401, 405, FLOOR - 14, FLOOR - 1); // its far bank
    for (const x of [14, 440, 462]) tree(world, x, FLOOR, 18 + (x % 7)); // none in the water's path
    downwindGoal.measure(world);
  },
  progress: (world) => downwindGoal.progress(world),
  solution: { wind: 1, windY: 0 },
};

/** 重: a pond under a cup hung upside down in the sky. Turn gravity over and the water falls up into it. */
const CUP: Box = [194, 34, 286, 62];
const cupGoal = gathering(CUP, 0.7);
const gravity: NatureLesson = {
  kind: 'nature',
  control: 'gravity',
  name: 'Gravity',
  glyph: '重',
  title: 'Make it rain upward',
  teach: 'The gravity gauge sets how hard things fall. Drag the bead down for a heavier world; at the dashed line things weigh nothing and drift, and above it they fall up. Turn gravity over to pour the pond up into the cup.',
  goal: 'Fill the cup in the sky',
  target: CUP,
  build(world) {
    floor(world);
    block(world, 120, 128, 30, FLOOR - 1); // the post
    block(world, 129, 290, 30, 33); // the arm, and the cup's base
    block(world, 190, 193, 34, 62); // the cup's sides
    block(world, 287, 290, 34, 62);
    block(world, 196, 199, FLOOR - 12, FLOOR - 1); // the pond's banks
    block(world, 281, 284, FLOOR - 12, FLOOR - 1);
    block(world, 200, 280, FLOOR - 10, FLOOR - 1, El.WATER);
    for (const x of [40, 80, 350, 420]) tree(world, x, FLOOR, 18 + (x % 8));
    cupGoal.measure(world);
  },
  progress: (world) => cupGoal.progress(world),
  solution: { gravity: -3 },
};

// ---- the mountain graph ----

const graph: GraphLesson = {
  kind: 'graph',
  name: 'Mountain graph',
  glyph: '山',
  title: 'Raise the peaks',
  teach: 'The mountain graph plans the painting before it is drawn. A filled red dot marks a tall peak, above the red line; a ring marks a lesser one. Drag the red line down to raise every mountain (or drag one mountain to raise just that one), then press Redraw to paint it.',
  goal: 'Paint at least three tall peaks',
  dims: DEFAULT_DIMS,
  seed: 42,
  params: { mountainHeight: 0.35, spacing: 0.5 },
  progress: (scan) => Math.min(1, (scan.counts.tallMountains ?? 0) / 3),
  solution: { mountainHeight: 0.8 },
};

export const LESSONS: Lesson[] = [slash, push, fire, water, erase, wind, gravity, graph];
