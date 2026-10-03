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
  },
  { gravity: [0.05, 1.5, 0.05], friction: [0, 1, 0.05], bounce: [0, 1, 0.05], checkEvery: [1, 30, 1] },
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
}

interface State {
  /** Body id per cell (0 = none). */
  mark: Int32Array;
  bodies: Body[];
  nextId: number;
  dirty: boolean;
  lastCheck: number;
}

const states = new WeakMap<World, State>();

function state(world: World): State {
  let s = states.get(world);
  if (!s) {
    s = { mark: new Int32Array(world.size), bodies: [], nextId: 1, dirty: false, lastCheck: -1e9 };
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

/**
 * Turn the given cells into one moving piece with a starting velocity. Cells that are not solid,
 * or already belong to a moving piece, are skipped.
 */
export function launchBody(world: World, cells: number[], vx: number, vy: number): void {
  const s = state(world);
  const own = cells.filter((i) => s.mark[i] === 0 && solidAt(world, i)).sort((a, b) => a - b);
  if (own.length === 0) return;
  const body: Body = { id: s.nextId++, cells: own, vx, vy, ax: 0, ay: 0 };
  for (const i of own) s.mark[i] = body.id;
  s.bodies.push(body);
  s.dirty = true; // what it was attached to may now hang free
}

// ---------------------------------------------------------------- detection

let stack = new Int32Array(0);
let seen = new Uint8Array(0);

function detect(world: World, s: State): void {
  const { w, h, size } = world;
  if (stack.length < size) {
    stack = new Int32Array(size);
    seen = new Uint8Array(size);
  } else seen.fill(0, 0, size);
  const { mark } = s;
  const free = (i: number) => mark[i] === 0 && solidAt(world, i);

  // 1. everything solid connected to the bottom row is anchored
  let top = 0;
  for (let x = 0; x < w; x++) {
    const i = (h - 1) * w + x;
    if (free(i)) {
      seen[i] = 1;
      stack[top++] = i;
    }
  }
  const visit = (j: number) => {
    if (!seen[j] && free(j)) {
      seen[j] = 1;
      stack[top++] = j;
    }
  };
  while (top > 0) {
    const i = stack[--top];
    const x = i % w;
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (i >= w) visit(i - w);
    if (i < size - w) visit(i + w);
  }

  // 2. every other solid component becomes a falling body
  for (let start = 0; start < size; start++) {
    if (seen[start] || !free(start)) continue;
    const cells: number[] = [];
    seen[start] = 1;
    stack[top++] = start;
    while (top > 0) {
      const i = stack[--top];
      cells.push(i);
      const x = i % w;
      if (x > 0) visit(i - 1);
      if (x < w - 1) visit(i + 1);
      if (i >= w) visit(i - w);
      if (i < size - w) visit(i + w);
    }
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

/** Can every cell of the body move by (dx, dy)? */
function canShift(world: World, s: State, b: Body, dx: number, dy: number): boolean {
  const { w, h, el } = world;
  const o = dx + dy * w;
  for (const i of b.cells) {
    const x = i % w;
    const y = (i / w) | 0;
    if (x + dx < 0 || x + dx >= w || y + dy < 0 || y + dy >= h) return false;
    const t = i + o;
    if (s.mark[t] === b.id) continue;
    const e = el[t];
    if (REPLACEABLE[e]) continue;
    const k = KIND[e];
    if (k === K_LIQUID || k === K_GAS || k === K_PROJECTILE) continue;
    return false;
  }
  return true;
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

/** Returns false when the body has come to rest (or vanished) and should be dropped. */
function moveBody(world: World, s: State, b: Body): boolean {
  // drop cells that were cut, burnt or otherwise stopped being solid
  let live = 0;
  for (const i of b.cells) {
    if (s.mark[i] === b.id && solidAt(world, i)) b.cells[live++] = i;
    else if (s.mark[i] === b.id) s.mark[i] = 0;
  }
  b.cells.length = live;
  if (live === 0) return false;

  const maxFall = Math.max(1, world.params.gravity);
  b.vy = Math.min(b.vy + rigidTunables.gravity, maxFall);
  b.ax += b.vx;
  b.ay += b.vy;

  for (let guard = 0; guard < 64 && (Math.abs(b.ax) >= 1 || Math.abs(b.ay) >= 1); guard++) {
    if (Math.abs(b.ay) >= Math.abs(b.ax)) {
      const sy = Math.sign(b.ay);
      if (canShift(world, s, b, 0, sy)) {
        shift(world, s, b, 0, sy);
        b.ay -= sy;
      } else {
        b.ay = 0;
        b.vy = 0;
        if (sy > 0) b.vx *= rigidTunables.friction; // landed: slide and slow down
      }
    } else {
      const sx = Math.sign(b.ax);
      if (canShift(world, s, b, sx, 0)) {
        shift(world, s, b, sx, 0);
        b.ax -= sx;
      } else {
        b.ax = 0;
        b.vx = -b.vx * rigidTunables.bounce;
      }
    }
  }

  const supported = !canShift(world, s, b, 0, 1);
  if (supported && Math.abs(b.vx) < 0.3 && b.vy <= rigidTunables.gravity) {
    for (const i of b.cells) s.mark[i] = 0;
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
