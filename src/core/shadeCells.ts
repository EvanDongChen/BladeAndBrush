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
}

/** A run shorter than this still gets a gentle gradient (a puddle does not go black at once). */
const MIN_RUN = 24;

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
let frameId = 0;
let runPos = new Int16Array(0);
let runLen = new Int16Array(0);
const occ5 = new Float32Array(25);
const col9 = new Uint32Array(9);

function ensure(size: number): void {
  if (stamp.length >= size) return;
  stamp = new Uint32Array(size);
  list = new Int32Array(size);
  cStamp = new Uint32Array(size);
  cCache = new Uint32Array(size);
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
function coverFor(k: number, key: number): Float64Array {
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

/** For `run` shaders: where each cell sits in its vertical run of the same family. */
function computeRuns(world: World): boolean {
  const { w, h, el } = world;
  let any = false;
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      const e = el[y * w + x];
      if (!RUN[e]) {
        y++;
        continue;
      }
      if (!any) {
        any = true;
        if (runPos.length < world.size) {
          runPos = new Int16Array(world.size);
          runLen = new Int16Array(world.size);
        }
      }
      const fam = FAMILY[e];
      let y1 = y;
      while (y1 + 1 < h && FAMILY[el[(y1 + 1) * w + x]] === fam && RUN[el[(y1 + 1) * w + x]]) y1++;
      const len = y1 - y + 1;
      for (let yy = y; yy <= y1; yy++) {
        runPos[yy * w + x] = yy - y;
        runLen[yy * w + x] = len;
      }
      y = y1 + 1;
    }
  }
  return any;
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
  const { w, h, el, aux, life } = world;
  const aw = w * k;
  const fxEnd = Math.min(w, Math.ceil(frontierX));
  ensure(world.size);
  frameId++;
  const haveRuns = computeRuns(world);
  px.tick = world.tick;
  cellView.tick = world.tick;

  // pass A: queue every shaded cell that needs drawing, and its 8 neighbours (for the spill)
  let n = 0;
  const queueAround = (cx: number, cy: number) => {
    const i = cy * w + cx;
    if (!SHADER[el[i]]) return;
    if (view && showsArt(world, view, i)) return;
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
      if (view && showsArt(world, view, i)) continue;
    } else if (e === El.EMPTY) {
      // a spill cell: take the most common shaded, non-art neighbour as the donor
      let best = -1;
      let bestCount = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (!SHADER[el[j]] || (view && showsArt(world, view, j))) continue;
          let count = 0;
          for (let ddy = -1; ddy <= 1; ddy++) {
            for (let ddx = -1; ddx <= 1; ddx++) {
              const mx = cx + ddx;
              const my = cy + ddy;
              if (mx < 0 || my < 0 || mx >= w || my >= h) continue;
              if (el[my * w + mx] === el[j]) count++;
            }
          }
          if (count > bestCount) {
            bestCount = count;
            best = j;
          }
        }
      }
      if (best < 0) continue;
      ref = best;
      e = el[best];
      sh = SHADER[e];
    } else continue;
    if (!sh) continue;
    if (region?.animated && !sh.static) region.animated[((cy / region.size) | 0) * region.cols + ((cx / region.size) | 0)] = 1;

    const fam = FAMILY[e];
    // 5x5 occupancy of this family (the left, right and bottom world edges are walls)
    let key = 0;
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        const nx = cx + ox;
        const ny = cy + oy;
        let o: number;
        if (ny < 0) o = 0;
        else if (nx < 0 || nx >= w || ny >= h) o = 1;
        else {
          const ne = el[ny * w + nx];
          o = SHADER[ne] && FAMILY[ne] === fam ? 1 : 0;
        }
        occ5[(oy + 2) * 5 + ox + 2] = o;
        key |= o << ((oy + 2) * 5 + ox + 2);
      }
    }
    const cov = coverFor(k, key);
    const selfOcc = occ5[12];
    const useBase = !sh.noBase;
    if (useBase) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          const inb = nx >= 0 && ny >= 0 && nx < w && ny < h;
          col9[(dy + 1) * 3 + dx + 1] = inb && occ5[(dy + 2) * 5 + dx + 2] > 0 ? colorAt(world, ny * w + nx) : 0;
        }
      }
    }
    const refColor = useBase ? colorAt(world, ref) : 0;
    px.aux = aux[ref];
    px.life = life[ref];
    px.i = ref;
    px.cx = cx;
    px.cy = cy;
    px.topEdge = selfOcc > 0 && occ5[7] < 1;
    const isRun = haveRuns && RUN[e] === 1;
    const pos = isRun ? runPos[ref] : 0;
    const len = isRun ? Math.max(MIN_RUN, runLen[ref]) : 1;

    paintCell(out, sh, cov, subFor(k), k, aw, cx, cy, pos, len, useBase, refColor);
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
    px.depth = len > 1 ? (pos + fy) / len : 0;
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
