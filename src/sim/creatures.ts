/**
 * Creatures: little living things (butterflies, birds, people) made of ordinary cells, so fire,
 * slash, falling rock and the eraser all work on them with no special cases.
 *
 * A creature is a sprite: a few cells of ONE element. One cell is the ANCHOR (aux has the ANCHOR bit)
 * and holds all of its state:
 *   vx = facing (+1 right, -1 left)   vy = animation frame   owner = variant (color)
 *   life = whatever the creature's AI keeps there (a countdown, a heading...)
 * Every cell of it also carries its object id (world.obj, core/objects.ts) if it is tracked, e.g. a
 * generated villager, so metrics can tell which creatures are still alive.
 * Every other cell is a PART whose vx/vy point back at the anchor, so a part can tell when its
 * anchor is gone, and the anchor can tell when a part is gone. A creature that has lost a cell
 * dies: if the missing cell is burning the rest of it catches fire, otherwise it bursts into
 * flying ink (SPLAT). A part whose anchor is gone dies the same way.
 *
 * Movement is "erase the sprite, draw it one step over", only when the new pose is free. Creatures
 * only move through empty space and gas, never through water or terrain. Everything is deterministic:
 * all randomness is world.rng and all timing comes from world.tick.
 */
import { registerBehavior } from '../core/behaviors';
import { Flag } from '../core/constants';
import { El } from '../core/elements';
import { registerPlacer } from '../core/objects';
import type { World } from '../core/world';
import { ignite } from './behaviors/fire';
import { at, K_GAS, K_POWDER, K_STATIC, KIND, REPLACEABLE } from './physics';
import { registerSpawner } from './spawn';
import { defineTunables } from './tunables';

export const creatureTunables = defineTunables(
  'creatures',
  {
    /** Ticks per step while a person strolls. */
    personStep: 7,
    /** Ticks per step while a person runs from fire. */
    personRun: 3,
    /** Ticks per move of a fluttering butterfly. */
    butterflyEvery: 3,
    /** Ticks per move of a flying bird. */
    birdEvery: 2,
    /** How close (cells) fire has to be before creatures run or fly away from it. */
    fleeRadius: 18,
  },
  {
    personStep: [1, 30, 1],
    personRun: [1, 30, 1],
    butterflyEvery: [1, 12, 1],
    birdEvery: [1, 12, 1],
    fleeRadius: [0, 40, 1],
  },
);

/** aux bit that marks the anchor cell. The low 5 bits of aux are the palette index. */
export const ANCHOR = 128;
export const PALETTE_MASK = 31;

/** One cell of a sprite relative to the anchor, facing right: [dx, dy, part]. */
export type Pixel = readonly [dx: number, dy: number, part: number];

export interface Creature {
  x: number;
  y: number;
  frame: number;
  face: number;
  variant: number;
  life: number;
  /** Tracked object id (0 = untracked). */
  obj: number;
}

export interface CreatureDef {
  el: number;
  /** Animation frames. Each lists its pixels facing right (mirrored when facing left) and must include [0, 0]. */
  frames: readonly (readonly Pixel[])[];
  /** How many colors/variants it comes in. */
  variants: number;
  /** Palette index (0..31) of a part, for a variant. */
  paint(part: number, variant: number): number;
  /** Acts once per tick on the anchor. Moves by calling relocate(). */
  think(world: World, c: Creature, def: CreatureDef): void;
  /** Dragging the brush spawns one every this many cells. */
  spawnSpacing?: number;
}

export const CREATURES = new Map<number, CreatureDef>();

/** Make a creature: registers its per-cell behavior, its brush spawner and its placer (for the generator). */
export function defineCreature(def: CreatureDef): CreatureDef {
  CREATURES.set(def.el, def);
  registerBehavior(def.el, (world, x, y) => updateCreature(world, x, y, def));
  registerSpawner(def.el, (world, x, y) => void spawnCreature(world, def, x, y), def.spawnSpacing ?? 12);
  registerPlacer({ el: def.el, place: (world, x, y, o) => spawnCreature(world, def, x, y, o.variant, o.face, o.obj) });
  return def;
}

// ---------------------------------------------------------------- sprite cells

/** Does the cell at index i (at x, y) belong to the creature of element `el` anchored at (ax, ay)? */
function owns(world: World, i: number, x: number, y: number, el: number, ax: number, ay: number): boolean {
  if (world.el[i] !== el) return false;
  const anchor = (world.aux[i] & ANCHOR) !== 0;
  if (x === ax && y === ay) return anchor;
  return !anchor && x + world.vx[i] === ax && y + world.vy[i] === ay;
}

/** Can a creature stand in a cell holding element e? Empty space, gas and stains; not fire. */
function passable(e: number): boolean {
  return REPLACEABLE[e] === 1 || (KIND[e] === K_GAS && e !== El.FIRE);
}

/** Is the whole pose free? Cells of the same creature at (oax, oay) count as free. */
function poseFree(world: World, def: CreatureDef, ax: number, ay: number, frame: number, face: number, oax: number, oay: number): boolean {
  const { w } = world;
  for (const [dx, dy] of def.frames[frame]) {
    const x = ax + (face < 0 ? -dx : dx);
    const y = ay + dy;
    if (!world.inBounds(x, y)) return false;
    const i = y * w + x;
    if (!passable(world.el[i]) && !owns(world, i, x, y, def.el, oax, oay)) return false;
  }
  return true;
}

function erase(world: World, def: CreatureDef, c: Creature): void {
  const { w } = world;
  for (const [dx, dy] of def.frames[c.frame]) {
    const x = c.x + (c.face < 0 ? -dx : dx);
    const y = c.y + dy;
    if (!world.inBounds(x, y)) continue;
    if (owns(world, y * w + x, x, y, def.el, c.x, c.y)) world.set(x, y, El.EMPTY);
  }
}

/** Write a pose into the grid. All its cells are marked UPDATED so nothing acts on them again this tick. */
function draw(world: World, def: CreatureDef, ax: number, ay: number, frame: number, face: number, variant: number, life: number, obj: number): void {
  const { w, flags } = world;
  for (const [dx, dy, part] of def.frames[frame]) {
    const ex = face < 0 ? -dx : dx;
    const x = ax + ex;
    const y = ay + dy;
    const aux = def.paint(part, variant);
    if (dx === 0 && dy === 0) world.set(x, y, def.el, { aux: ANCHOR | aux, owner: variant, obj, life, vx: face, vy: frame });
    else world.set(x, y, def.el, { aux, owner: variant, obj, vx: -ex, vy: -dy });
    flags[y * w + x] |= Flag.UPDATED;
  }
}

/**
 * Move to the pose at (c.x + dx, c.y + dy) with the given frame and facing, if it is free. On
 * success the creature (and `c`) is there; otherwise nothing changes. (0, 0) re-poses in place.
 */
export function relocate(world: World, def: CreatureDef, c: Creature, dx: number, dy: number, frame = c.frame, face = c.face): boolean {
  const nx = c.x + dx;
  const ny = c.y + dy;
  if (!poseFree(world, def, nx, ny, frame, face, c.x, c.y)) return false;
  erase(world, def, c);
  draw(world, def, nx, ny, frame, face, c.variant, c.life, c.obj);
  c.x = nx;
  c.y = ny;
  c.frame = frame;
  c.face = face;
  return true;
}

/**
 * Cells kept clear at the left and right edges (the scroll's rollers cover them on the level
 * page) and at the top: wind and lift never push a creature in there, so it stays in view.
 */
export const EDGE_MARGIN = 16;
const TOP_MARGIN = 10;

/** relocate() for pushes from wind, lift and upside-down gravity: refuses to push a creature toward an edge it is already near. */
export function nudge(world: World, def: CreatureDef, c: Creature, dx: number, dy: number): boolean {
  const nx = c.x + dx;
  if ((dx < 0 && nx < EDGE_MARGIN) || (dx > 0 && nx >= world.w - EDGE_MARGIN) || (dy < 0 && c.y + dy < TOP_MARGIN)) return false;
  return relocate(world, def, c, dx, dy);
}

/** Would the pose be free, and (if `grounded`) have ground under its lowest cells? Does not move. */
export function canPose(world: World, def: CreatureDef, c: Creature, dx: number, dy: number, frame: number, face: number, grounded: boolean): boolean {
  const nx = c.x + dx;
  const ny = c.y + dy;
  return poseFree(world, def, nx, ny, frame, face, c.x, c.y) && (!grounded || groundedAt(world, def, nx, ny, frame, face));
}

/** Is there solid ground (rock, wood, earth, hay...) directly under the sprite's lowest cells? */
export function groundedAt(world: World, def: CreatureDef, ax: number, ay: number, frame: number, face: number): boolean {
  const pixels = def.frames[frame];
  let bottom = -Infinity;
  for (const p of pixels) bottom = Math.max(bottom, p[1]);
  for (const [dx, dy] of pixels) {
    if (dy !== bottom) continue;
    const k = KIND[at(world, ax + (face < 0 ? -dx : dx), ay + bottom + 1)];
    if (k === K_STATIC || k === K_POWDER) return true;
  }
  return false;
}

/** Cells of this creature that are no longer there: 0 intact, 1 damaged, 2 damaged and burning. */
function damage(world: World, def: CreatureDef, c: Creature): number {
  const { w } = world;
  let broken = false;
  let burning = false;
  for (const [dx, dy] of def.frames[c.frame]) {
    const x = c.x + (c.face < 0 ? -dx : dx);
    const y = c.y + dy;
    if (!world.inBounds(x, y)) {
      broken = true;
      continue;
    }
    const i = y * w + x;
    if (owns(world, i, x, y, def.el, c.x, c.y)) continue;
    broken = true;
    if (world.el[i] === El.FIRE) burning = true;
  }
  return broken ? (burning ? 2 : 1) : 0;
}

/** A cell of a creature that lost its body: it catches fire, or bursts into flying ink. */
function perish(world: World, x: number, y: number, burning: boolean): void {
  if (burning) {
    ignite(world, x, y);
    return;
  }
  const { rng } = world;
  world.set(x, y, El.SPLAT, { vx: rng.int(5) - 2, vy: -rng.int(3), aux: rng.int(256) });
  world.flags[y * world.w + x] |= Flag.UPDATED;
}

function die(world: World, def: CreatureDef, c: Creature, burning: boolean): void {
  const { w } = world;
  for (const [dx, dy] of def.frames[c.frame]) {
    const x = c.x + (c.face < 0 ? -dx : dx);
    const y = c.y + dy;
    if (world.inBounds(x, y) && owns(world, y * w + x, x, y, def.el, c.x, c.y)) perish(world, x, y, burning);
  }
}

/** Nudges tried, nearest first, when an invulnerable creature has to re-form somewhere free. */
const NUDGES: readonly [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) out.push([dx, dy]);
  return out.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);
})();

/**
 * An invulnerable creature that lost a cell (cut, burnt, crushed) re-forms whole: what is left of it
 * is cleared and it is drawn again where it is, or as near as there is room. If there is no room
 * anywhere near, what is left of it simply waits; it never dies.
 */
function heal(world: World, def: CreatureDef, c: Creature): void {
  for (const [dx, dy] of NUDGES) {
    if (!poseFree(world, def, c.x + dx, c.y + dy, c.frame, c.face, c.x, c.y)) continue;
    erase(world, def, c);
    draw(world, def, c.x + dx, c.y + dy, c.frame, c.face, c.variant, c.life, c.obj);
    return;
  }
}

/** A part cell: if its anchor is gone, it dies with it (unless the creature is invulnerable). */
function updatePart(world: World, x: number, y: number, def: CreatureDef): void {
  const { w, el, aux } = world;
  const i = y * w + x;
  const ax = x + world.vx[i];
  const ay = y + world.vy[i];
  if (world.inBounds(ax, ay)) {
    const a = ay * w + ax;
    if (el[a] === el[i] && (aux[a] & ANCHOR) !== 0) return;
    if (reform(world, def, i, ax, ay)) return;
    perish(world, x, y, el[a] === El.FIRE); // a burning anchor sets its parts alight
    return;
  }
  if (reform(world, def, i, x, y)) return;
  perish(world, x, y, false);
}

/**
 * The anchor of an invulnerable creature is gone (cut away): its part at index i rebuilds it whole
 * around where the anchor was (or as near as there is room), clearing its leftover parts first.
 */
function reform(world: World, def: CreatureDef, i: number, ax: number, ay: number): boolean {
  const id = world.obj[i];
  if (id === 0 || !world.objects.get(id)?.tags.includes('invulnerable')) return false;
  const variant = world.owner[i];
  const { w, h, obj, el } = world;
  for (let y = Math.max(0, ay - 4); y <= Math.min(h - 1, ay + 4); y++) {
    for (let x = Math.max(0, ax - 4); x <= Math.min(w - 1, ax + 4); x++) if (obj[y * w + x] === id && el[y * w + x] === def.el) world.set(x, y, El.EMPTY);
  }
  for (const [dx, dy] of NUDGES) {
    if (!poseFree(world, def, ax + dx, ay + dy, 0, 1, -1, -1)) continue;
    draw(world, def, ax + dx, ay + dy, 0, 1, variant, 0, id);
    return true;
  }
  // no room for all of it yet (a crowded hollow): it keeps one cell, its anchor, where this part
  // was, and heal() grows it back whole as soon as there is room
  const px = i % w;
  const py = (i / w) | 0;
  world.set(px, py, def.el, { aux: ANCHOR | def.paint(0, variant), owner: variant, obj: id, vx: 1, vy: 0 });
  world.flags[i] |= Flag.UPDATED;
  return true;
}

const cur: Creature = { x: 0, y: 0, frame: 0, face: 1, variant: 0, life: 0, obj: 0 };

/** The per-cell behavior of a creature element. */
function updateCreature(world: World, x: number, y: number, def: CreatureDef): void {
  const i = y * world.w + x;
  if ((world.aux[i] & ANCHOR) === 0) {
    updatePart(world, x, y, def);
    return;
  }
  const c = cur;
  c.x = x;
  c.y = y;
  c.frame = world.vy[i];
  c.face = world.vx[i] < 0 ? -1 : 1;
  c.variant = world.owner[i];
  c.life = world.life[i];
  c.obj = world.obj[i];
  const hurt = damage(world, def, c);
  if (hurt !== 0) {
    if (c.obj !== 0 && world.objects.get(c.obj)?.tags.includes('invulnerable')) {
      heal(world, def, c); // a creature the level protects (a caged bird) pulls itself back together
      return;
    }
    die(world, def, c, hurt === 2);
    return;
  }
  def.think(world, c, def);
  world.life[c.y * world.w + c.x] = c.life;
}

// ---------------------------------------------------------------- spawning

/**
 * Put a creature at (x, y), nudging it upward until it fits. Returns false if there was no room.
 * Variant and facing are random (from world.rng) unless given; `obj` tags it as a tracked object.
 */
export function spawnCreature(world: World, def: CreatureDef, x: number, y: number, variant?: number, face?: number, obj = 0): boolean {
  const v = variant ?? world.rng.int(def.variants);
  const f = face ?? (world.rng.chance(0.5) ? 1 : -1);
  const ax = Math.round(x);
  const ay = Math.round(y);
  for (let k = 0; k <= 24; k++) {
    if (poseFree(world, def, ax, ay - k, 0, f, -1, -1)) {
      draw(world, def, ax, ay - k, 0, f, v, 0, obj);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- fire sensing

/** Result of the last scanFire(): the direction away from nearby fire (nearer flames count more). */
export const flee = { x: 0, y: 0, count: 0 };

/** Look for fire within `radius` cells. If found, `flee` holds the way to run. */
export function scanFire(world: World, x: number, y: number, radius: number): boolean {
  const { w, h, el } = world;
  const x0 = Math.max(0, x - radius);
  const x1 = Math.min(w - 1, x + radius);
  const y0 = Math.max(0, y - radius);
  const y1 = Math.min(h - 1, y + radius);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      if (el[yy * w + xx] !== El.FIRE) continue;
      const dx = x - xx;
      const dy = y - yy;
      const wgt = 1 / (1 + dx * dx + dy * dy);
      sx += dx * wgt;
      sy += dy * wgt;
      n++;
    }
  }
  flee.x = sx;
  flee.y = sy;
  flee.count = n;
  return n > 0;
}
