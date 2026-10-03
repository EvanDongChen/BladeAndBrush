/**
 * Rigid pieces. Static solid material (rock, wood, leaf) that is no longer connected to the
 * bottom of the canvas becomes a body that falls as one piece, keeping its shape, until it lands.
 * Bodies can also be thrown (the push ability launches them with a velocity).
 *
 * A body moves one cell at a time. Fluids, gases and projectiles in its way are displaced to the
 * cells it vacates (so a rock dropped in a pond pushes the water up around it); anything else
 * solid, or the canvas edge, stops it. Once it is supported and has stopped sliding it turns back
 * into ordinary static terrain.
 *
 * Detection is not run every tick: anything that can remove support (slash, null, push, burnt
 * wood, the paint eraser) calls markUnsupported(world), and the next detection finds the pieces.
 * Burning wood (FIRE with a rigid fuel) still counts as solid until it burns out.
 */
import { registerPass } from '../../core/behaviors';
import { flagOn } from '../../core/config';
import { El } from '../../core/elements';
import type { World } from '../../core/world';
import { DEBRIS } from '../elements/debris';
import { K_GAS, K_LIQUID, K_PROJECTILE, KIND, REPLACEABLE, RIGID } from '../physics';
import { defineTunables } from '../tunables';

export const rigidTunables = defineTunables(
  'rigid',
  {
    /** Downward acceleration of falling pieces (cells per tick, per tick). Max fall speed is the gravity param. */
    gravity: 0.35,
    /** Horizontal speed kept per tick while sliding on the ground. */
    friction: 0.6,
    /** Fraction of horizontal speed kept (reversed) when hitting a wall. */
    bounce: 0.25,
    /** Ticks between support checks after something changed. */
    checkEvery: 4,
    /** Landing faster than this (cells per tick) rebounds instead of stopping. */
    impact: 2.5,
  },
  { gravity: [0.05, 1.5, 0.05], friction: [0, 1, 0.05], bounce: [0, 1, 0.05], checkEvery: [1, 30, 1], impact: [0.5, 12, 0.5] },
);

interface Body {
  id: number;
  /** Cell indices, kept sorted ascending. */
  cells: number[];
  vx: number;
  vy: number;
  /** Sub-cell movement not yet applied. */
  ax: number;
  ay: number;
  /** Fraction of speed kept (reversed) when it hits something side-on or overhead. */
  bounce: number;
  /** Thrown pieces that are walled in and cannot move at all burst into rubble instead. */
  shatter: boolean;
  /** Ticks since launch. */
  age: number;
}

interface State {
  /** Body id per cell (0 = none). */
  mark: Int32Array;
  bodies: Body[];
  byId: Map<number, Body>;
  nextId: number;
  dirty: boolean;
  lastCheck: number;
}

const states = new WeakMap<World, State>();

function state(world: World): State {
  let s = states.get(world);
  if (!s) {
    s = { mark: new Int32Array(world.size), bodies: [], byId: new Map(), nextId: 1, dirty: false, lastCheck: -1e9 };
    states.set(world, s);
  }
  return s;
}

/** Solid for support: rigid material, or rigid material that is currently burning. */
function solidAt(world: World, i: number): boolean {
  const e = world.el[i];
  return RIGID[e] === 1 || (e === El.FIRE && RIGID[world.aux[i]] === 1);
}

/** Something may have lost its support; check soon. */
export function markUnsupported(world: World): void {
  state(world).dirty = true;
}

/** Number of moving pieces (for tests and the sandbox status line). */
export function bodyCount(world: World): number {
  return states.get(world)?.bodies.length ?? 0;
}

/** Snapshot of the moving pieces, for debugging. */
export function bodyInfo(world: World): { cells: number; x: number; y: number; vx: number; vy: number }[] {
  return (states.get(world)?.bodies ?? []).map((b) => ({
    cells: b.cells.length,
    x: b.cells[0] % world.w,
    y: (b.cells[0] / world.w) | 0,
    vx: Math.round(b.vx * 100) / 100,
    vy: Math.round(b.vy * 100) / 100,
  }));
}

/**
 * Turn the given cells into one moving piece with a starting velocity. Cells that are not solid,
 * or already belong to a moving piece, are skipped. `bounce` defaults to rigidTunables.bounce. With
 * `shatter`, a piece that turns out to be walled in on all sides bursts into flying rubble (DEBRIS)
 * with its velocity instead of sitting still.
 */
export function launchBody(world: World, cells: number[], vx: number, vy: number, bounce = rigidTunables.bounce, shatter = false): void {
  const s = state(world);
  const own = cells.filter((i) => s.mark[i] === 0 && solidAt(world, i)).sort((a, b) => a - b);
  if (own.length === 0) return;
  const body: Body = { id: s.nextId++, cells: own, vx, vy, ax: 0, ay: 0, bounce, shatter, age: 0 };
  for (const i of own) s.mark[i] = body.id;
  s.bodies.push(body);
  s.byId.set(body.id, body);
  s.dirty = true; // what it was attached to may now hang free
}

// ---------------------------------------------------------------- detection

let stack = new Int32Array(0);
/** Per cell during detection: 0 = not free solid, 1 = free solid not yet visited, 2 = visited. */
let cellState = new Uint8Array(0);

function detect(world: World, s: State): void {
  const { w, h, size, el, aux } = world;
  if (stack.length < size) {
    stack = new Int32Array(size);
    cellState = new Uint8Array(size);
  }
  // locals for the hot loops (imported bindings can be slow to read in some module loaders)
  const cell = cellState;
  const rigid = RIGID;
  const FIRE = El.FIRE;
  const { mark } = s;
  for (let i = 0; i < size; i++) {
    const e = el[i];
    cell[i] = mark[i] === 0 && (rigid[e] === 1 || (e === FIRE && rigid[aux[i]] === 1)) ? 1 : 0;
  }

  /** Flood from `start` through free solid cells, collecting them into `out` if given. */
  const flood = (start: number, out: number[] | null): void => {
    let top = 0;
    cell[start] = 2;
    stack[top++] = start;
    while (top > 0) {
      const i = stack[--top];
      if (out) out.push(i);
      const x = i % w;
      if (x > 0 && cell[i - 1] === 1) (cell[i - 1] = 2), (stack[top++] = i - 1);
      if (x < w - 1 && cell[i + 1] === 1) (cell[i + 1] = 2), (stack[top++] = i + 1);
      if (i >= w && cell[i - w] === 1) (cell[i - w] = 2), (stack[top++] = i - w);
      if (i < size - w && cell[i + w] === 1) (cell[i + w] = 2), (stack[top++] = i + w);
    }
  };

  // 1. everything solid connected to the bottom row is anchored
  for (let i = (h - 1) * w; i < size; i++) if (cell[i] === 1) flood(i, null);

  // 2. every other solid component becomes a falling body
  for (let i = 0; i < size; i++) {
    if (cell[i] !== 1) continue;
    const cells: number[] = [];
    flood(i, cells);
    launchBody(world, cells, 0, 0);
  }
  s.dirty = false;
}

// ---------------------------------------------------------------- movement

// scratch for displaced cells (reused, so moving bodies allocate nothing per tick)
const dTail: number[] = [];
const dEl: number[] = [];
const dLife: number[] = [];
const dAux: number[] = [];
const dVx: number[] = [];
const dVy: number[] = [];
const dOwner: number[] = [];

/** canShift result: the move is clear. */
const CLEAR = 0;
/** canShift result: terrain or the canvas edge is in the way. (Any positive value is the id of a body in the way.) */
const WALL = -1;

/** Can every cell of the body move by (dx, dy)? CLEAR, WALL, or the id of another moving body in the way. */
function canShift(world: World, s: State, b: Body, dx: number, dy: number): number {
  const { w, h, el } = world;
  const o = dx + dy * w;
  for (const i of b.cells) {
    const x = i % w;
    const y = (i / w) | 0;
    if (x + dx < 0 || x + dx >= w || y + dy < 0 || y + dy >= h) return WALL;
    const t = i + o;
    const m = s.mark[t];
    if (m === b.id) continue;
    const e = el[t];
    if (REPLACEABLE[e]) continue;
    const k = KIND[e];
    if (k === K_LIQUID || k === K_GAS || k === K_PROJECTILE) continue;
    return m !== 0 && s.byId.has(m) ? m : WALL;
  }
  return CLEAR;
}

/**
 * Two moving bodies bumped along one axis: exchange momentum (masses are cell counts) with a
 * little restitution, so a rebounding chunk shoves the one behind it instead of jamming.
 */
function collide(a: Body, b: Body, axis: 'x' | 'y'): void {
  const ka = axis === 'x' ? 'vx' : 'vy';
  const ma = a.cells.length;
  const mb = b.cells.length;
  const va = a[ka];
  const vb = b[ka];
  const e = Math.min(a.bounce, b.bounce);
  const p = ma * va + mb * vb;
  a[ka] = (p - mb * e * (va - vb)) / (ma + mb);
  b[ka] = (p + ma * e * (va - vb)) / (ma + mb);
}
/**
 * Move the body one cell by (dx, dy). Along each line of the body in the move direction, the
 * cell in front is displaced to the line's tail, so nothing is destroyed.
 */
function shift(world: World, s: State, b: Body, dx: number, dy: number): void {
  const { w, el, life, aux, vx, vy, owner } = world;
  const { mark } = s;
  const o = dx + dy * w;
  const cells = b.cells;
  dTail.length = dEl.length = dLife.length = dAux.length = dVx.length = dVy.length = dOwner.length = 0;

  // 1. remember what is in front of each line, and where that line's tail is
  for (const i of cells) {
    const t = i + o;
    if (mark[t] === b.id) continue;
    let tail = i;
    for (;;) {
      const prev = tail - o;
      if (dx !== 0 && (tail % w) === (dx > 0 ? 0 : w - 1)) break; // don't wrap rows
      if (prev < 0 || prev >= world.size || mark[prev] !== b.id) break;
      tail = prev;
    }
    dTail.push(tail);
    dEl.push(el[t]);
    dLife.push(life[t]);
    dAux.push(aux[t]);
    dVx.push(vx[t]);
    dVy.push(vy[t]);
    dOwner.push(owner[t]);
  }

  // 2. move every body cell, front first
  const n = cells.length;
  for (let k = 0; k < n; k++) {
    const i = o > 0 ? cells[n - 1 - k] : cells[k];
    const j = i + o;
    el[j] = el[i];
    life[j] = life[i];
    aux[j] = aux[i];
    vx[j] = vx[i];
    vy[j] = vy[i];
    owner[j] = owner[i];
  }

  // 3. displaced cells land on the tails
  for (let k = 0; k < dTail.length; k++) {
    const t = dTail[k];
    el[t] = dEl[k];
    life[t] = dLife[k];
    aux[t] = dAux[k];
    vx[t] = dVx[k];
    vy[t] = dVy[k];
    owner[t] = dOwner[k];
  }

  for (const i of cells) mark[i] = 0;
  for (let k = 0; k < n; k++) {
    cells[k] += o;
    mark[cells[k]] = b.id;
  }
}

/** Blocked straight down: slide one cell diagonally down if there is room. */
function slide(world: World, s: State, b: Body): boolean {
  const first = b.vx !== 0 ? Math.sign(b.vx) : world.rng.chance(0.5) ? 1 : -1;
  for (let k = 0; k < 2; k++) {
    const sx = k === 0 ? first : -first;
    if (canShift(world, s, b, sx, 0) === CLEAR && canShift(world, s, b, sx, 1) === CLEAR) {
      shift(world, s, b, sx, 0);
      shift(world, s, b, 0, 1);
      return true;
    }
  }
  return false;
}

/** Nothing below it and no slope to slide down. */
function supported(world: World, s: State, b: Body): boolean {
  if (canShift(world, s, b, 0, 1) === CLEAR) return false;
  for (let sx = -1; sx <= 1; sx += 2) {
    if (canShift(world, s, b, sx, 0) === CLEAR && canShift(world, s, b, sx, 1) === CLEAR) return false;
  }
  return true;
}

function release(s: State, b: Body): void {
  for (const i of b.cells) if (s.mark[i] === b.id) s.mark[i] = 0;
  s.byId.delete(b.id);
}

/**
 * A thrown piece with nowhere to go breaks into rubble: each cell flies as DEBRIS carrying its
 * element, spraying outward from the piece's middle along its velocity, and lands back as itself.
 */
function burst(world: World, s: State, b: Body, speed: number): void {
  const { w, el, aux, life, vx, vy, rng } = world;
  let mx = 0;
  let my = 0;
  for (const i of b.cells) (mx += i % w), (my += (i / w) | 0);
  mx /= b.cells.length;
  my /= b.cells.length;
  const clamp = (v: number) => Math.max(-12, Math.min(12, Math.round(v)));
  for (const i of b.cells) {
    s.mark[i] = 0;
    if (!RIGID[el[i]]) continue; // e.g. burning wood stays put
    const dx = (i % w) - mx;
    const dy = ((i / w) | 0) - my;
    const d = Math.hypot(dx, dy) || 1;
    const spread = speed * 0.5;
    life[i] = aux[i]; // DEBRIS keeps the shade in life and the element in aux
    aux[i] = el[i];
    el[i] = DEBRIS;
    vx[i] = clamp(b.vx + (dx / d) * spread + rng.range(-1, 1));
    vy[i] = clamp(b.vy + (dy / d) * spread + rng.range(-1, 1));
  }
  s.byId.delete(b.id);
  s.dirty = true;
}

/** Returns false when the body has come to rest (or vanished) and should be dropped. */
function moveBody(world: World, s: State, b: Body): boolean {
  // drop cells that were cut, burnt or otherwise stopped being solid
  let live = 0;
  for (const i of b.cells) {
    if (s.mark[i] === b.id && solidAt(world, i)) b.cells[live++] = i;
    else if (s.mark[i] === b.id) s.mark[i] = 0;
  }
  b.cells.length = live;
  if (live === 0) {
    release(s, b);
    return false;
  }

  const maxFall = Math.max(1, world.params.gravity);
  if (b.vy < maxFall) b.vy = Math.min(b.vy + rigidTunables.gravity, maxFall); // thrown faster than that? keep it
  b.ax += b.vx;
  b.ay += b.vy;

  const speed = Math.hypot(b.vx, b.vy);
  let shifts = 0;
  for (let guard = 0; guard < 64 && (Math.abs(b.ax) >= 1 || Math.abs(b.ay) >= 1); guard++) {
    if (Math.abs(b.ay) >= Math.abs(b.ax)) {
      const sy = Math.sign(b.ay);
      const r = canShift(world, s, b, 0, sy);
      if (r === CLEAR) {
        shift(world, s, b, 0, sy);
        b.ay -= sy;
        shifts++;
        continue;
      }
      b.ay = 0;
      if (r !== WALL && sy < 0) collide(b, s.byId.get(r)!, 'y');
      else if (sy > 0 && r === WALL && slide(world, s, b)) b.ay = Math.max(0, b.vy - 1); // slid down a slope
      else if (sy > 0 && r === WALL && b.vy > rigidTunables.impact) {
        b.vy = -b.vy * b.bounce; // hit the ground hard: rebound (blasted rock flies back out)
        b.vx *= rigidTunables.friction;
      } else if (sy > 0) {
        // landed on terrain, or is resting on another piece (pieces stack, they don't trade fall speed)
        b.vy = 0;
        b.vx *= rigidTunables.friction; // landed: skid and slow down
      } else b.vy = -b.vy * b.bounce; // hit something overhead
    } else {
      const sx = Math.sign(b.ax);
      const r = canShift(world, s, b, sx, 0);
      if (r === CLEAR) {
        shift(world, s, b, sx, 0);
        b.ax -= sx;
        shifts++;
        continue;
      }
      b.ax = 0;
      if (r !== WALL) collide(b, s.byId.get(r)!, 'x');
      else b.vx = -b.vx * b.bounce;
    }
  }

  if (b.shatter && b.age++ < 2 && shifts === 0 && speed > 1.5) {
    burst(world, s, b, speed);
    return false;
  }

  if (Math.abs(b.vx) < 0.3 && b.vy <= rigidTunables.gravity && supported(world, s, b)) {
    // resting on a piece that may still move away: re-check support soon so it can't end up floating
    if (canShift(world, s, b, 0, 1) !== WALL) s.dirty = true;
    release(s, b);
    return false;
  }
  return true;
}
registerPass({
  name: 'rigidBodies',
  phase: 'pre',
  order: 10,
  run: (world) => {
    if (!flagOn('rigidBodies')) return;
    const s = states.get(world);
    if (!s) return;
    if (s.dirty && world.tick - s.lastCheck >= rigidTunables.checkEvery) {
      s.lastCheck = world.tick;
      detect(world, s);
    }
    if (s.bodies.length === 0) return;
    // lowest bodies first, so a stack falls together instead of the top one waiting
    s.bodies.sort((a, b) => b.cells[b.cells.length - 1] - a.cells[a.cells.length - 1] || a.id - b.id);
    let keep = 0;
    for (const b of s.bodies) if (moveBody(world, s, b)) s.bodies[keep++] = b;
    s.bodies.length = keep;
  },
});
