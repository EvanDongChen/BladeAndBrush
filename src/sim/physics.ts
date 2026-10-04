/**
 * Shared movement rules for all behaviors. Movement is cell-to-cell: a mover may overwrite a
 * REPLACEABLE cell (EMPTY, or visual-only STAIN), or swap with a fluid it is denser than (sinking)
 * or lighter than (rising). Moved cells are marked UPDATED so they move at most once per tick.
 */
import { registerPass } from '../core/behaviors';
import { Flag } from '../core/constants';
import { El, ELEMENTS, elements } from '../core/elements';
import type { World } from '../core/world';

export const K_EMPTY = 0;
export const K_STATIC = 1;
export const K_POWDER = 2;
export const K_LIQUID = 3;
export const K_GAS = 4;
export const K_PROJECTILE = 5;

const KIND_CODE = { empty: K_EMPTY, static: K_STATIC, powder: K_POWDER, liquid: K_LIQUID, gas: K_GAS, projectile: K_PROJECTILE };

// Per-element lookup tables for the hot loop, rebuilt whenever the element registry changes.
export const KIND = new Uint8Array(256);
export const DENSITY = new Float32Array(256);
export const FLAMMABILITY = new Float32Array(256);
/** 1 if a mover may simply overwrite the cell. */
export const REPLACEABLE = new Uint8Array(256);
/** 1 for solid material that a slash can cut and splatter (static or powder, not STAIN). */
export const CUTTABLE = new Uint8Array(256);
/** 1 for static solid material that holds together as rigid pieces (rock, wood, leaf; not STAIN, not anchored). */
export const RIGID = new Uint8Array(256);
/** 1 for anchored material that falls once its object is cut apart (the moon). Also RIGID. */
export const HANGING = new Uint8Array(256);

let builtVersion = -1;

export function refreshTables(): void {
  if (builtVersion === elements.version) return;
  for (let id = 0; id < 256; id++) {
    const def = ELEMENTS[id];
    const kind = def ? KIND_CODE[def.kind] : K_STATIC; // unregistered ids act as walls
    KIND[id] = kind;
    DENSITY[id] = def?.density ?? 1000;
    FLAMMABILITY[id] = def?.flammability ?? 0;
    REPLACEABLE[id] = kind === K_EMPTY || id === El.STAIN ? 1 : 0;
    CUTTABLE[id] = (kind === K_STATIC || kind === K_POWDER) && id !== El.STAIN ? 1 : 0;
    HANGING[id] = def?.hanging ? 1 : 0;
    RIGID[id] = kind === K_STATIC && id !== El.STAIN && def !== undefined && (!def.anchored || def.hanging) ? 1 : 0;
  }
  builtVersion = elements.version;
}

refreshTables();
registerPass({ name: 'physicsTables', phase: 'pre', order: -1000, run: refreshTables });

/** Result of a movement check. */
export const BLOCKED = 0;
export const FREE = 1;
export const SWAP = 2;

/** Can `mover` move down/sideways into a cell holding `target`? Sinks through lighter fluids. */
export function canSink(mover: number, target: number): number {
  if (REPLACEABLE[target]) return FREE;
  const k = KIND[target];
  return (k === K_LIQUID || k === K_GAS) && DENSITY[target] < DENSITY[mover] ? SWAP : BLOCKED;
}

/** Can `mover` rise into a cell holding `target`? Rises through heavier fluids. */
export function canRise(mover: number, target: number): number {
  if (REPLACEABLE[target]) return FREE;
  const k = KIND[target];
  return (k === K_LIQUID || k === K_GAS) && DENSITY[target] > DENSITY[mover] ? SWAP : BLOCKED;
}

/** Element at (x, y); out of bounds reads as ROCK (walls). */
export function at(world: World, x: number, y: number): number {
  return x >= 0 && y >= 0 && x < world.w && y < world.h ? world.el[y * world.w + x] : El.ROCK;
}

/**
 * Move the cell at (x, y) to (nx, ny). FREE overwrites the target (destroying a STAIN there),
 * SWAP exchanges the two cells. Returns the new index.
 */
export function moveCell(world: World, x: number, y: number, nx: number, ny: number, mode: number): number {
  const { w, el, life, aux, vx, vy, owner, obj, flags } = world;
  const i = y * w + x;
  const j = ny * w + nx;
  if (mode === SWAP) {
    world.swap(x, y, nx, ny);
    return j;
  }
  el[j] = el[i];
  life[j] = life[i];
  aux[j] = aux[i];
  vx[j] = vx[i];
  vy[j] = vy[i];
  owner[j] = owner[i];
  obj[j] = obj[i];
  flags[j] |= Flag.UPDATED;
  el[i] = El.EMPTY;
  life[i] = 0;
  vx[i] = 0;
  vy[i] = 0;
  owner[i] = 0;
  obj[i] = 0;
  world.changed(i); // layered pixels: what was behind the cell that left comes forward
  return j;
}

/** The wind, -1 (blowing left) to 1 (blowing right). Clouds, gas, rain, water and falling people lean with it. */
export function windOf(world: World): number {
  return Math.max(-1, Math.min(1, world.params.wind ?? 0));
}

/** The wind's vertical part, -1 (an updraft, blowing up) to 1 (a downdraft). Lifts or presses water and villagers. */
export function windYOf(world: World): number {
  return Math.max(-1, Math.min(1, world.params.windY ?? 0));
}

/** The gravity param: above 0 things fall, 0 is weightless (things float slowly up), below 0 they fly up. */
export function gravityOf(world: World): number {
  return world.params.gravity ?? 2;
}

/** Which way loose things fall: 1 down, -1 up (weightless or negative gravity). */
export function fallDir(world: World): number {
  return gravityOf(world) > 0 ? 1 : -1;
}

/**
 * Accelerating fall: vy grows by 1 per tick up to the strength of gravity, and the cell drops up
 * to vy cells through free space (or one cell through a lighter fluid). Below zero gravity it
 * "falls" upward; at zero it floats up one cell every few ticks and otherwise holds still.
 * Returns true if it moved (or, when weightless, if it is drifting and should do nothing else).
 */
export function fall(world: World, x: number, y: number): boolean {
  const i = y * world.w + x;
  const me = world.el[i];
  const g = gravityOf(world);
  const dir = g > 0 ? 1 : -1;
  if (g === 0 && (world.tick + x) % 3 !== 0) return true; // weightless: hang in the air between drifts
  const maxV = g === 0 ? 1 : Math.max(1, Math.abs(g) | 0);
  const v = Math.min(world.vy[i] + 1, maxV);
  let dist = 0;
  let mode = BLOCKED;
  for (let k = 1; k <= v; k++) {
    const m = canSink(me, at(world, x, y + dir * k));
    if (m === FREE) {
      dist = k;
      mode = FREE;
      continue;
    }
    if (m === SWAP && k === 1) {
      dist = 1;
      mode = SWAP;
    }
    break;
  }
  if (dist === 0) {
    world.vy[i] = 0;
    return false;
  }
  const j = moveCell(world, x, y, x, y + dir * dist, mode);
  world.vy[j] = mode === SWAP ? 1 : v; // sinking through fluid is slow
  return true;
}

/** Slide one cell diagonally down (up, when gravity is turned over), trying a random side first. Returns true if it moved. */
export function slideDiagonal(world: World, x: number, y: number): boolean {
  const me = world.el[y * world.w + x];
  const dy = fallDir(world);
  const first = world.rng.chance(0.5) ? 1 : -1;
  for (let s = 0; s < 2; s++) {
    const dx = s === 0 ? first : -first;
    const m = canSink(me, at(world, x + dx, y + dy));
    if (m !== BLOCKED) {
      moveCell(world, x, y, x + dx, y + dy, m);
      return true;
    }
  }
  return false;
}

/** The 8 neighbors as [dx, dy] pairs, flattened. */
export const NEIGHBORS8 = [-1, -1, 0, -1, 1, -1, -1, 0, 1, 0, -1, 1, 0, 1, 1, 1];
/** The 4 orthogonal neighbors as [dx, dy] pairs, flattened. */
export const NEIGHBORS4 = [0, -1, -1, 0, 1, 0, 0, 1];
