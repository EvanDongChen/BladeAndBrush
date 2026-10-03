import { Flag, type LevelDims } from './constants';
import { El } from './elements';
import { EventBus } from './events';
import { Hasher } from './hash';
import { defaultParams, type GenParams } from './params';
import { Rng } from './rng';

export interface SetOpts {
  life?: number;
  aux?: number;
  vx?: number;
  vy?: number;
  owner?: number;
  /** Mark the cell CUT (slash scar) and emit 'cut' if it held something. */
  cut?: boolean;
}

export interface WaterSource {
  x: number;
  y: number;
  /** Cells per tick (fractional rates are up to the emitter). */
  rate: number;
}

/**
 * The painting as a cell grid. Structure-of-arrays: one typed array per field, indexed by
 * idx(x, y) = y * w + x, with y = 0 at the TOP. This is the single source of truth for physics,
 * scanning and replay.
 */
export class World {
  readonly w: number;
  readonly h: number;
  readonly size: number;
  tick = 0;
  /** ALL randomness in the sim goes through this. */
  rng: Rng;
  /** Gravity etc., readable by behaviors. */
  params: GenParams;
  readonly events = new EventBus();

  readonly el: Uint8Array; // element id per cell
  readonly life: Uint8Array; // countdown (fire lifetime, etc.)
  readonly aux: Uint8Array; // element-specific (ink wetness, water pressure, shade variation)
  readonly vx: Int8Array; // velocity, cells/tick (SPLAT, push)
  readonly vy: Int8Array;
  readonly owner: Uint16Array; // stroke id (0 = none). Links cell -> Blueprint registry entry
  readonly flags: Uint8Array; // see Flag in constants.ts

  /** Active water sources. The frontier reveal adds them; B's emitter pass reads them. */
  sources: WaterSource[] = [];

  constructor(dims: LevelDims, seed: number, params: GenParams = defaultParams()) {
    this.w = dims.w;
    this.h = dims.h;
    this.size = dims.w * dims.h;
    this.rng = new Rng(seed);
    this.params = { ...params };
    this.el = new Uint8Array(this.size);
    this.life = new Uint8Array(this.size);
    this.aux = new Uint8Array(this.size);
    this.vx = new Int8Array(this.size);
    this.vy = new Int8Array(this.size);
    this.owner = new Uint16Array(this.size);
    this.flags = new Uint8Array(this.size);
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** Out-of-bounds reads as ROCK, so the edges behave like solid walls. */
  get(x: number, y: number): number {
    return this.inBounds(x, y) ? this.el[y * this.w + x] : El.ROCK;
  }

  isEmpty(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.el[y * this.w + x] === El.EMPTY;
  }

  /**
   * Write a cell. Clears life, velocity and owner unless given in opts; keeps aux (shade) unless
   * given; keeps flags. Out-of-bounds writes are ignored.
   */
  set(x: number, y: number, el: number, opts?: SetOpts): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.w + x;
    const prev = this.el[i];
    if (opts?.cut) {
      this.flags[i] |= Flag.CUT;
      if (prev !== El.EMPTY && this.events.has('cut')) {
        this.events.emit('cut', { x, y, el: prev, owner: this.owner[i] });
      }
    }
    this.el[i] = el;
    this.life[i] = opts?.life ?? 0;
    this.vx[i] = opts?.vx ?? 0;
    this.vy[i] = opts?.vy ?? 0;
    this.owner[i] = opts?.owner ?? 0;
    if (opts?.aux !== undefined) this.aux[i] = opts.aux;
  }

  /**
   * Swap the contents of two cells. CUT/GENERATED flags stay with the position; both cells are
   * marked UPDATED so they do not move again this tick.
   */
  swap(x1: number, y1: number, x2: number, y2: number): void {
    const a = y1 * this.w + x1;
    const b = y2 * this.w + x2;
    swapIn(this.el, a, b);
    swapIn(this.life, a, b);
    swapIn(this.aux, a, b);
    swapIn(this.vx, a, b);
    swapIn(this.vy, a, b);
    swapIn(this.owner, a, b);
    this.flags[a] |= Flag.UPDATED;
    this.flags[b] |= Flag.UPDATED;
  }

  /** Inclusive rectangle, clipped to the grid. */
  clearRect(x0: number, y0: number, x1: number, y1: number, opts?: SetOpts): void {
    const xa = Math.max(0, Math.floor(Math.min(x0, x1)));
    const xb = Math.min(this.w - 1, Math.floor(Math.max(x0, x1)));
    const ya = Math.max(0, Math.floor(Math.min(y0, y1)));
    const yb = Math.min(this.h - 1, Math.floor(Math.max(y0, y1)));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) this.set(x, y, El.EMPTY, opts);
  }

  /** Visit every in-bounds cell within radius r of (cx, cy). */
  forCircle(cx: number, cy: number, r: number, fn: (x: number, y: number) => void): void {
    const r2 = r * r;
    const xa = Math.max(0, Math.floor(cx - r));
    const xb = Math.min(this.w - 1, Math.ceil(cx + r));
    const ya = Math.max(0, Math.floor(cy - r));
    const yb = Math.min(this.h - 1, Math.ceil(cy + r));
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) fn(x, y);
      }
    }
  }

  clearCircle(cx: number, cy: number, r: number, opts?: SetOpts): void {
    this.forCircle(cx, cy, r, (x, y) => this.set(x, y, El.EMPTY, opts));
  }

  /** Count cells per element id. */
  countByElement(out = new Uint32Array(256)): Uint32Array {
    out.fill(0);
    for (let i = 0; i < this.size; i++) out[this.el[i]]++;
    return out;
  }

  /** Deterministic hash of all cell state, the tick and the RNG state. UPDATED bits are ignored. */
  hash(): number {
    return new Hasher()
      .int(this.w)
      .int(this.h)
      .int(this.tick)
      .int(this.rng.state)
      .int(this.sources.length)
      .bytes(this.el)
      .bytes(this.life)
      .bytes(this.aux)
      .bytes(this.vx)
      .bytes(this.vy)
      .u16(this.owner)
      .bytes(this.flags, 0xff & ~Flag.UPDATED)
      .digest();
  }
}

function swapIn(a: Uint8Array | Int8Array | Uint16Array, i: number, j: number): void {
  const t = a[i];
  a[i] = a[j];
  a[j] = t;
}
