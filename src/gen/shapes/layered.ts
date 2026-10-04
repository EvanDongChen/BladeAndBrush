import { createNoise } from '../../core/noise';
import { hashSeed, Rng } from '../../core/rng';
import type { Placement } from '../plan';
import type { Profile, ShapeCtx } from './registry';

export interface LayeredOpts {
  /** Number of nested contour layers (default 10). */
  layers?: number;
  /** Plateau: tops are cut flat at this fraction of the height (flat mountains). */
  chop?: number;
}

const POINTS = 50;

/**
 * A mountain as nested contour layers (our own formulation of the shan-shui idea): layer 0 is the
 * silhouette, a cosine hump modulated by smooth noise; each deeper layer is the same idea on its own
 * noise row, shrunk toward the centre and sunk slightly lower, so the layers fan out from the peak
 * toward the feet. Texture strokes run along (and between) these layers.
 */
export function layeredMountain(p: Placement, ctx: ShapeCtx, o: LayeredOpts = {}): Profile {
  const { u, params, base } = ctx;
  const rng = new Rng(hashSeed(p.seed, 'layered'));
  const noise = createNoise(hashSeed(p.seed, 'layered', 'noise'));
  const L = o.layers ?? 10;
  const rugged = Math.max(1, Math.min(8, params.ruggedness));
  const octaves = 2 + Math.round(rugged / 3);
  const freq = 0.55 + 0.1 * rugged;
  const cx = u.toArt(p.x);
  const hw = Math.max(4, u.toArt(p.halfWidth));
  const H = u.toArt(p.height);
  const chop = o.chop;

  const grid: [number, number][][] = [];
  let sink = 0;
  for (let j = 0; j < L; j++) {
    sink += rng.next() * u.toArt(p.y / 100); // deeper layers sit a little lower
    const scale = chop === undefined ? 1 - j / L : 1 - (j / L) * 0.6;
    const row: [number, number][] = [];
    for (let i = 0; i < POINTS; i++) {
      const t = (i / (POINTS - 1) - 0.5) * Math.PI;
      const env = chop === undefined ? Math.cos(t) : (Math.cos(2 * t) + 1) / 2;
      let h = env * noise.fbm2(t * freq + 10, j * 0.15, octaves) * H * scale;
      if (chop !== undefined && h > chop * H) h = chop * H + (h - chop * H) * 0.04;
      row.push([cx + (t / Math.PI) * 2 * hw * scale, base - h + sink]);
    }
    grid.push(row);
  }

  // Per-column view of the silhouette and layers (what fills, cells and trees use).
  const sil = grid[0];
  const x0 = Math.max(0, Math.floor(sil[0][0]));
  const x1 = Math.min(u.artW - 1, Math.ceil(sil[sil.length - 1][0]));
  const n = Math.max(0, x1 - x0 + 1);
  const column = (row: [number, number][], out: Float32Array) => {
    out.fill(u.artH);
    let k = 0;
    for (let j = 0; j < n; j++) {
      const x = x0 + j;
      if (x < row[0][0] || x > row[row.length - 1][0]) continue;
      while (k + 1 < row.length - 1 && row[k + 1][0] < x) k++;
      const [ax, ay] = row[k];
      const [bx, by] = row[k + 1];
      const f = bx > ax ? (x - ax) / (bx - ax) : 0;
      out[j] = Math.max(0, Math.min(base, ay + (by - ay) * f));
    }
    return out;
  };
  const tops = column(sil, new Float32Array(n));
  const layers = grid.slice(1).map((row) => {
    const c = column(row, new Float32Array(n));
    for (let j = 0; j < n; j++) if (c[j] < tops[j]) c[j] = tops[j];
    return c;
  });
  let peak = 0;
  for (let j = 1; j < n; j++) if (tops[j] < tops[peak]) peak = j;
  let plateau: [number, number][] | undefined;
  if (chop !== undefined) {
    const lim = base - chop * H + u.toArt(1);
    const top = sil.filter((q) => q[1] <= lim);
    if (top.length >= 2) plateau = top;
  }
  return { x0, tops, layers, base, peakX: x0 + peak, peakY: n > 0 ? tops[peak] : base, grid, plateau };
}
