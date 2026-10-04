import { over } from './artCompose';
import type { ArtView } from './blueprint';
import { FAR_PLANE, NO_PLANE } from './constants';
import { El, ELEMENTS, type CellView } from './elements';
import { FAMILY, RUN, resolveShaders, anyShader, sampleTexture, smoothstep, SHADER, type Shader, type ShadePx } from './shaders';
import type { World } from './world';

/** A set of square tiles of cells to draw, and where to report the tiles that animate. */
export interface ShadeRegion {
  /** 1 per tile to draw, row-major, `cols` tiles per row. */
  tiles: Uint8Array;
  cols: number;
  /** Tile side in cells. */
  size: number;
  /** If given, set to 1 for every tile that drew a cell whose shader is not `static`. */
  animated?: Uint8Array;
  /** If given, each drawn cell is written here as a record (for the GPU) instead of painted into `out`. */
  cells?: CellRecords;
}

/**
 * Per-cell shading records (core/gpuArt.ts draws the pixels from them). Per cell i, at 4*i:
 * [0] the 25-bit occupancy key, [1] shader id | topEdge << 8 | useBase << 9 | run << 10 |
 * aux << 16 | life << 24 (shader id 0 = nothing drawn), [2] the reference cell, [3] (as float, via
 * `recF`) its depth in its body. `color` holds the element's color(cell) for every cell a drawn
 * cell blends with.
 */
export interface CellRecords {
  rec: Uint32Array;
  recF: Float32Array;
  color: Uint32Array;
  shaderId(sh: Shader): number;
}

export { RUN_DEPTH };

/** Cells from the open surface at which a `run` body reaches full depth (see bodyDepth). */
const RUN_DEPTH = 32;
/** Cells of air above water that make it open surface (fewer is an air pocket in the body). */
const OPEN_AIR = 4;
/** Cost of a sideways step in the depth distance (a step down costs 1). */
const SIDE_STEP = 2;
/** Sideways softening of the depth, cells each side. */
const BLUR = 4;
/** Depths are exact up to here; deeper is all full depth. */
const DEPTH_CAP = RUN_DEPTH + 8;
const FAR = 0x7fff;
let bodyCounter = 0;
let bodyId = new Int32Array(0);
let bodyDepthF = new Float32Array(0);

const px: ShadePx = {
  x: 0, y: 0, cx: 0, cy: 0, fx: 0, fy: 0, cover: 1, v: 1, depth: 0, topEdge: false,
  tick: 0, aux: 0, life: 0, i: 0, base: 0,
  tex: sampleTexture,
};
const cellView: CellView = { x: 0, y: 0, el: 0, life: 0, aux: 0, owner: 0, flags: 0, tick: 0 };

// ---- per-call scratch, sized to the world ----
let stamp = new Uint32Array(0); // cell was queued this frame
let list = new Int32Array(0); // queued cells
let cStamp = new Uint32Array(0); // cached color is from this frame
let cCache = new Uint32Array(0);
let sStamp = new Uint32Array(0); // isSource() answer is from this frame
let sVal = new Uint8Array(0);
let frameId = 0;
let bodyStamp = new Uint32Array(0); // bodyLvl is from this frame
let bodyLvl = new Int16Array(0); // per run cell: its depth in its body (bodyDepth)
let bodyStack = new Int32Array(0);
let bodyCells = new Int32Array(0);
const col9 = new Uint32Array(9);
const FAM_CODE = new Uint16Array(256);
const nb9 = new Int16Array(9);

function ensure(size: number): void {
  if (stamp.length >= size) return;
  stamp = new Uint32Array(size);
  list = new Int32Array(size);
  cStamp = new Uint32Array(size);
  bodyStamp = new Uint32Array(size);
  bodyLvl = new Int16Array(size);
  bodyId = new Int32Array(size);
  bodyDepthF = new Float32Array(size);
  cCache = new Uint32Array(size);
  sStamp = new Uint32Array(size);
  sVal = new Uint8Array(size);
}

/** A shaded cell that is not showing generator art (it gets drawn, and spills), memoized per frame. */
function isSource(world: World, view: ArtView | undefined, i: number): boolean {
  if (sStamp[i] === frameId) return sVal[i] === 1;
  const v = SHADER[world.el[i]] !== undefined && !(view && showsArt(world, view, i));
  sStamp[i] = frameId;
  sVal[i] = v ? 1 : 0;
  return v;
}

/** The element's own color(cell), computed once per cell per frame. */
function colorAt(world: World, i: number): number {
  if (cStamp[i] === frameId) return cCache[i];
  const e = world.el[i];
  const def = ELEMENTS[e];
  cellView.x = i % world.w;
  cellView.y = (i / world.w) | 0;
  cellView.el = e;
  cellView.life = world.life[i];
  cellView.aux = world.aux[i];
  cellView.owner = world.owner[i];
  cellView.flags = world.flags[i];
  const c = def ? def.color(cellView) : 0xffff00ff;
  cStamp[i] = frameId;
  cCache[i] = c;
  return c;
}

/** Cubic B-spline taps per sub-pixel for a given k (cached). */
const tapCache = new Map<number, { b: Int8Array; w: Float32Array }>();
function tapsFor(k: number): { b: Int8Array; w: Float32Array } {
  let t = tapCache.get(k);
  if (t) return t;
  t = { b: new Int8Array(k), w: new Float32Array(k * 4) };
  for (let s = 0; s < k; s++) {
    const u = (s + 0.5) / k - 0.5; // -0.5..0.5 from the cell centre
    const b = u < 0 ? -1 : 0;
    const f = u - b; // 0..1 between centres b and b+1
    t.b[s] = b;
    t.w[s * 4] = ((1 - f) ** 3) / 6;
    t.w[s * 4 + 1] = (3 * f ** 3 - 6 * f * f + 4) / 6;
    t.w[s * 4 + 2] = (-3 * f ** 3 + 3 * f * f + 3 * f + 1) / 6;
    t.w[s * 4 + 3] = f ** 3 / 6;
  }
  tapCache.set(k, t);
  return t;
}

/**
 * Coverage tables: the B-spline blend `v` and the soft coverage of every sub-pixel depend only on
 * the 5x5 occupancy pattern (25 bits) and k, so each pattern is computed once. Entry s*2 = the shader's `v`
 * (stretched so an interior reads ~1), s*2+1 = cover, for sub-pixel s = sy*k + sx.
 */
const coverCache = new Map<number, Map<number, Float64Array>>();
let lastK = 0;
let lastKey = -1;
let lastTab: Float64Array | null = null;
function coverFor(k: number, key: number): Float64Array {
  if (key === lastKey && k === lastK && lastTab) return lastTab;
  lastKey = key;
  lastK = k;
  return (lastTab = coverLookup(k, key));
}
function coverLookup(k: number, key: number): Float64Array {
  let byKey = coverCache.get(k);
  if (!byKey) coverCache.set(k, (byKey = new Map()));
  let tab = byKey.get(key);
  if (tab) return tab;
  if (byKey.size > 65536) byKey.clear(); // a pathological scene: start over rather than grow forever
  const T = tapsFor(k);
  tab = new Float64Array(k * k * 2);
  for (let sy = 0; sy < k; sy++) {
    const by = T.b[sy];
    for (let sx = 0; sx < k; sx++) {
      const bx = T.b[sx];
      let v = 0;
      for (let j = 0; j < 4; j++) {
        const row = (by + 1 + j) * 5; // tap cell offset by-1+j, +2 for the array
        let rs = 0;
        for (let i2 = 0; i2 < 4; i2++) rs += T.w[sx * 4 + i2] * ((key >>> (row + bx + 1 + i2)) & 1);
        v += T.w[sy * 4 + j] * rs;
      }
      tab[(sy * k + sx) * 2] = v < 0.44 ? v : 0.44 + (v - 0.44) * 1.3;
      tab[(sy * k + sx) * 2 + 1] = smoothstep(0.22, 0.56, v);
    }
  }
  byKey.set(key, tab);
  return tab;
}

/**
 * Per-k sub-pixel constants: `f[s]` = position (s + 0.5) / k inside the cell, and for the colour
 * blend of sub-pixel (sx, sy) its four nearest cells (`cell`, indices into the 3x3 col9) and their
 * bilinear weights (`w`), in the order the blend adds them.
 */
const subCache = new Map<number, { f: Float64Array; cell: Uint8Array; w: Float64Array }>();
function subFor(k: number): { f: Float64Array; cell: Uint8Array; w: Float64Array } {
  let t = subCache.get(k);
  if (t) return t;
  t = { f: new Float64Array(k), cell: new Uint8Array(k * k * 4), w: new Float64Array(k * k * 4) };
  for (let s = 0; s < k; s++) t.f[s] = (s + 0.5) / k;
  for (let sy = 0; sy < k; sy++) {
    const uy = t.f[sy] - 0.5;
    const dyDir = uy < 0 ? -1 : 1;
    const ay = Math.abs(uy);
    for (let sx = 0; sx < k; sx++) {
      const ux = t.f[sx] - 0.5;
      const dxDir = ux < 0 ? -1 : 1;
      const ax = Math.abs(ux);
      for (let n = 0; n < 4; n++) {
        const ddx = n & 1 ? dxDir : 0;
        const ddy = n & 2 ? dyDir : 0;
        t.cell[(sy * k + sx) * 4 + n] = (ddy + 1) * 3 + ddx + 1;
        t.w[(sy * k + sx) * 4 + n] = (n & 1 ? ax : 1 - ax) * (n & 2 ? ay : 1 - ay);
      }
    }
  }
  subCache.set(k, t);
  return t;
}

/**
 * For `run` shaders: how deep cell i sits in its body (4-connected cells of one family), as the
 * distance through the body to its nearest open surface (open air above it, see openAbove). Found
 * once per body per frame. A lake darkens straight down from its surface, a stream or a river
 * running downhill stays shallow, water under a shelf takes its depth from the open water next to
 * it, and neighbouring cells differ by at most one, so a body never bands.
 */
function bodyDepth(world: World, i: number, fam: number): number {
  if (bodyStamp[i] === frameId) return bodyDepthF[i];
  const { w, h, el } = world;
  if (bodyStack.length < world.size) {
    bodyStack = new Int32Array(world.size);
    bodyCells = new Int32Array(world.size);
  }
  // 1. the body's cells, and its open surface (the seeds)
  let top = 0;
  let n = 0;
  let seeds = 0;
  bodyStamp[i] = frameId;
  bodyStack[top++] = i;
  while (top > 0) {
    const c = bodyStack[--top];
    bodyCells[n++] = c;
    bodyLvl[c] = FAR;
    const x = c % w;
    const y = (c / w) | 0;
    if (openAbove(el, c, w)) seeds++;
    if (x > 0) top = pushBody(el, c - 1, fam, top);
    if (x < w - 1) top = pushBody(el, c + 1, fam, top);
    if (y > 0) top = pushBody(el, c - w, fam, top);
    if (y < h - 1) top = pushBody(el, c + w, fam, top);
  }
  // 2. distance from the open surface (a body covered all over: from its top cells), a step down
  //    or up costing 1 and a sideways step SIDE_STEP, so depth is mostly straight down and open
  //    water at the top of a narrow gap does not spread a pale cone across the body. A chamfer
  //    transform: sweeps over the body's box until nothing changes (a few), deterministic.
  const id = ++bodyCounter;
  let x0 = w;
  let x1 = 0;
  let y0 = h;
  let y1 = 0;
  for (let m = 0; m < n; m++) {
    const c = bodyCells[m];
    const x = c % w;
    const y = (c / w) | 0;
    bodyId[c] = id;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    const up = y > 0 ? el[c - w] : El.EMPTY;
    const seed = seeds > 0 ? openAbove(el, c, w) : y === 0 || !(RUN[up] && FAMILY[up] === fam);
    if (seed) bodyLvl[c] = 0;
  }
  const lower = (c: number, from: number, cost: number): boolean => {
    if (bodyId[from] !== id) return false;
    const d = bodyLvl[from] + cost;
    if (d >= bodyLvl[c]) return false;
    bodyLvl[c] = d;
    return true;
  };
  for (let changed = true, pass = 0; changed && pass < 8; pass++) {
    changed = false;
    for (let y = y0 + 1; y <= y1; y++) for (let x = x0; x <= x1; x++) { const c = y * w + x; if (bodyId[c] === id && lower(c, c - w, 1)) changed = true; }
    for (let y = y1 - 1; y >= y0; y--) for (let x = x0; x <= x1; x++) { const c = y * w + x; if (bodyId[c] === id && lower(c, c + w, 1)) changed = true; }
    for (let y = y0; y <= y1; y++) {
      for (let x = x0 + 1; x <= x1; x++) { const c = y * w + x; if (bodyId[c] === id && lower(c, c - 1, SIDE_STEP)) changed = true; }
      for (let x = x1 - 1; x >= x0; x--) { const c = y * w + x; if (bodyId[c] === id && lower(c, c + 1, SIDE_STEP)) changed = true; }
    }
  }
  for (let m = 0; m < n; m++) if (bodyLvl[bodyCells[m]] > DEPTH_CAP) bodyLvl[bodyCells[m]] = DEPTH_CAP;
  // 3. soften it sideways (a sloped surface steps from column to column): the mean over the body's
  //    cells within BLUR cells along the row
  for (let m = 0; m < n; m++) {
    const c = bodyCells[m];
    const x = c % w;
    const row = c - x;
    let sum = 0;
    let cnt = 0;
    for (let xx = Math.max(0, x - BLUR); xx <= Math.min(w - 1, x + BLUR); xx++) {
      const j = row + xx;
      if (bodyId[j] !== id) continue;
      sum += bodyLvl[j];
      cnt++;
    }
    bodyDepthF[c] = sum / cnt;
  }
  return bodyDepthF[i];
}

/** Open surface: air for OPEN_AIR cells straight above (an air pocket trapped in the body does not count). */
function openAbove(el: Uint8Array, c: number, w: number): boolean {
  for (let k = 1, j = c - w; k <= OPEN_AIR; k++, j -= w) {
    if (j < 0) return true;
    if (el[j] !== El.EMPTY) return false;
  }
  return true;
}

function pushBody(el: Uint8Array, j: number, fam: number, top: number): number {
  if (bodyStamp[j] === frameId) return top;
  const e = el[j];
  if (!RUN[e] || FAMILY[e] !== fam) return top;
  bodyStamp[j] = frameId;
  bodyStack[top] = j;
  return top + 1;
}


/** True if compose() already drew this cell from the generator's art (so it needs no shading). */
function showsArt(world: World, view: ArtView, i: number): boolean {
  const we = world.el[i];
  const wp = world.plane[i];
  if (we === view.el[i] && wp === view.plane[i]) return true;
  if (wp === FAR_PLANE && we === El.ROCK) return true;
  return wp !== NO_PLANE && view.planes[wp]?.el[i] === we;
}

/**
 * Draw every shaded cell that is not showing generator art into `out` (art resolution, row width
 * w*k). Smoothing: a body's coverage is a cubic B-spline blend of the occupancy of the cells around
 * each pixel (so staircase edges become slopes, and the shape spills into the empty cells beside
 * it), and the element's own colors are blended between neighbouring cells. Then the element's
 * shader runs per pixel.
 *
 * With a `region`, only the cells inside its marked tiles are drawn (the caller cleared them first).
 */
export function shadeCells(
  out: Uint32Array,
  world: World,
  k: number,
  view: ArtView | undefined,
  frontierX: number,
  region?: ShadeRegion,
): void {
  resolveShaders();
  if (!anyShader) return;
  // per element: 0 = not shaded, else its family + 1 (the occupancy test is one table read)
  for (let e = 0; e < 256; e++) FAM_CODE[e] = SHADER[e] ? FAMILY[e] + 1 : 0;
  const { w, h, el, aux, life } = world;
  const aw = w * k;
  const fxEnd = Math.min(w, Math.ceil(frontierX));
  ensure(world.size);
  frameId++;
  px.tick = world.tick;
  cellView.tick = world.tick;

  // pass A: queue every shaded cell that needs drawing, and its 8 neighbours (for the spill)
  let n = 0;
  const queueAround = (cx: number, cy: number) => {
    if (!isSource(world, view, cy * w + cx)) return;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        if (nx < 0 || nx >= fxEnd) continue;
        if (region && !region.tiles[((ny / region.size) | 0) * region.cols + ((nx / region.size) | 0)]) continue;
        const j = ny * w + nx;
        if (stamp[j] !== frameId) {
          stamp[j] = frameId;
          list[n++] = j;
        }
      }
    }
  };
  if (!region) {
    for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < fxEnd; cx++) queueAround(cx, cy);
  } else {
    // only the region's tiles, plus a one-cell ring around each (cells there spill into the tile)
    const { tiles, cols, size } = region;
    for (let t = 0; t < tiles.length; t++) {
      if (!tiles[t]) continue;
      const tx = (t % cols) * size;
      const ty = ((t / cols) | 0) * size;
      const ya = Math.max(0, ty - 1);
      const yb = Math.min(h, ty + size + 1);
      const xa = Math.max(0, tx - 1);
      const xb = Math.min(fxEnd, tx + size + 1);
      for (let cy = ya; cy < yb; cy++) for (let cx = xa; cx < xb; cx++) queueAround(cx, cy);
    }
  }

  // pass B: draw them
  for (let q = 0; q < n; q++) {
    const i = list[q];
    const cx = i % w;
    const cy = (i / w) | 0;
    let e = el[i];
    let ref = i; // the cell that supplies element, aux, life and run position
    let sh = SHADER[e];
    if (sh) {
      if (!isSource(world, view, i)) continue;
    } else if (e === El.EMPTY) {
      // a spill cell: take the most common shaded, non-art neighbour as the donor (ties: the first
      // in reading order); "common" = how many of the 3x3 around this cell hold its element
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          nb9[(dy + 1) * 3 + dx + 1] = nx < 0 || ny < 0 || nx >= w || ny >= h ? -1 : el[ny * w + nx];
        }
      }
      let best = -1;
      let bestCount = 0;
      for (let t = 0; t < 9; t++) {
        const ne = nb9[t];
        if (t === 4 || ne < 0 || !SHADER[ne]) continue;
        const j = (cy + ((t / 3) | 0) - 1) * w + cx + (t % 3) - 1;
        if (!isSource(world, view, j)) continue;
        let count = 0;
        for (let u = 0; u < 9; u++) if (nb9[u] === ne) count++;
        if (count > bestCount) {
          bestCount = count;
          best = j;
        }
      }
      if (best < 0) continue;
      ref = best;
      e = el[best];
      sh = SHADER[e];
    } else continue;
    if (!sh) continue;
    if (region?.animated && !sh.static) region.animated[((cy / region.size) | 0) * region.cols + ((cx / region.size) | 0)] = 1;

    const code = FAM_CODE[e];
    // 5x5 occupancy of this family as 25 bits (the left, right and bottom world edges are walls)
    let key = 0;
    if (cx >= 2 && cy >= 2 && cx < w - 2 && cy < h - 2) {
      let bit = 0;
      for (let ny = cy - 2; ny <= cy + 2; ny++) {
        const row = ny * w;
        for (let nx = cx - 2; nx <= cx + 2; nx++, bit++) if (FAM_CODE[el[row + nx]] === code) key |= 1 << bit;
      }
    } else {
      for (let oy = -2; oy <= 2; oy++) {
        for (let ox = -2; ox <= 2; ox++) {
          const nx = cx + ox;
          const ny = cy + oy;
          let o: number;
          if (ny < 0) o = 0;
          else if (nx < 0 || nx >= w || ny >= h) o = 1;
          else o = FAM_CODE[el[ny * w + nx]] === code ? 1 : 0;
          key |= o << ((oy + 2) * 5 + ox + 2);
        }
      }
    }
    const cov = coverFor(k, key);

    const useBase = !sh.noBase;
    const cells = region?.cells;
    if (useBase) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          const inb = nx >= 0 && ny >= 0 && nx < w && ny < h;
          const c = inb && (key >>> ((dy + 2) * 5 + dx + 2)) & 1 ? colorAt(world, ny * w + nx) : 0;
          col9[(dy + 1) * 3 + dx + 1] = c;
          if (cells && c !== 0) cells.color[ny * w + nx] = c;
        }
      }
    }
    const refColor = useBase ? colorAt(world, ref) : 0;
    if (cells && useBase) cells.color[ref] = refColor;
    px.aux = aux[ref];
    px.life = life[ref];
    px.i = ref;
    px.cx = cx;
    px.cy = cy;
    px.topEdge = (key & (1 << 12)) !== 0 && (key & (1 << 7)) === 0;
    const isRun = RUN[e] === 1;
    const pos = isRun ? bodyDepth(world, ref, FAMILY[e]) : 0;

    if (cells) {
      const o = i * 4;
      const topEdge = (key & (1 << 12)) !== 0 && (key & (1 << 7)) === 0;
      cells.rec[o] = key;
      cells.rec[o + 1] = cells.shaderId(sh) | (topEdge ? 256 : 0) | (useBase ? 512 : 0) | (isRun ? 1024 : 0) | (aux[ref] << 16) | (life[ref] << 24);
      cells.rec[o + 2] = ref;
      cells.recF[o + 3] = pos;
      continue;
    }
    paintCell(out, sh, cov, subFor(k), k, aw, cx, cy, pos, isRun ? RUN_DEPTH : 1, useBase, refColor);
  }
}

/**
 * One cell's k x k art pixels (kept small and separate so V8 can inline the shader call; the
 * per-cell setup in shadeCells has already filled px and col9).
 */
function paintCell(
  out: Uint32Array,
  sh: Shader,
  cov: Float64Array,
  sub: { f: Float64Array; cell: Uint8Array; w: Float64Array },
  k: number,
  aw: number,
  cx: number,
  cy: number,
  pos: number,
  len: number,
  useBase: boolean,
  refColor: number,
): void {
  for (let sy = 0; sy < k; sy++) {
    const fy = sub.f[sy];
    const rowIdx = (cy * k + sy) * aw + cx * k;
    // the same for the whole pixel row
    px.y = cy * k + sy;
    px.fy = fy;
    px.depth = len > 1 ? Math.max(0, Math.min(1, (pos + fy) / len)) : 0;
    for (let sx = 0; sx < k; sx++) {
      const s2 = (sy * k + sx) * 2;
      const cover = cov[s2 + 1];
      if (cover <= 0.01) continue;
      px.x = cx * k + sx;
      px.fx = sub.f[sx];
      px.cover = cover;
      px.v = cov[s2]; // interior reads ~1, an edge ~0.5
      if (useBase) {
        // blend the colors of the four nearest cells, weighted by occupancy
        const s4 = (sy * k + sx) * 4;
        let wr = 0;
        let wg = 0;
        let wb = 0;
        let wa = 0;
        let ws = 0;
        for (let t = 0; t < 4; t++) {
          const c = col9[sub.cell[s4 + t]];
          if (c === 0) continue;
          const wgt = sub.w[s4 + t];
          wr += wgt * (c & 255);
          wg += wgt * ((c >>> 8) & 255);
          wb += wgt * ((c >>> 16) & 255);
          wa += wgt * (c >>> 24);
          ws += wgt;
        }
        px.base =
          ws > 0.001
            ? ((((wa / ws) | 0) << 24) | (((wb / ws) | 0) << 16) | (((wg / ws) | 0) << 8) | ((wr / ws) | 0)) >>> 0
            : refColor;
      }
      const c = sh.shade(px);
      const a = Math.round((c >>> 24) * cover);
      if (a <= 0) continue;
      const col = ((c & 0xffffff) | (a << 24)) >>> 0;
      const at = rowIdx + sx;
      out[at] = out[at] === 0 ? col : over(col, out[at]);
    }
  }
}
