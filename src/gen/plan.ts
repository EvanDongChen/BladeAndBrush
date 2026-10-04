import type { Blueprint } from '../core/blueprint';
import { createNoise } from '../core/noise';
import type { GenParams } from '../core/params';
import { hashSeed, Rng } from '../core/rng';
import { artOf } from './artState';
import { DEPTH } from './layout';
import { SCROLL_H, type Units } from './units';

export type Depth = 'near' | 'mid' | 'far';

/** One thing to draw, in painting units. `kind` names a registered shape. */
export interface Placement {
  kind: string;
  x: number;
  /** Foot of the object on the page (painting units, y down): the farther away, the smaller y. */
  y: number;
  halfWidth: number;
  height: number;
  depth: Depth;
  seed: number;
}

const STEP = 10; // planning grid, painting units
const EDGE = 60; // keep peak centers this far from the scroll ends

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Minimum distance between peaks in the near row; `spacing` is the 0..1 slider. */
export function minGap(spacing: number): number {
  return lerp(150, 700, Math.min(1, Math.max(0, spacing)));
}

/**
 * Where the mountains go. Pure: same (seed, params, units) gives the same plan.
 * - A slow noise curve scores every x; the best-scoring xs become mountains, greedily kept at
 *   least minGap apart (near row) or 0.7 * minGap apart (mid row, its own curve), and never
 *   touching a neighbour in their row (a land gap that grows with spacing).
 * - Together the near and mid rows cover at most COVER_MAX of the scroll, so land shows.
 */
export function makePlan(seed: number, params: GenParams, u: Units): Placement[] {
  const rng = new Rng(hashSeed(seed, 'plan'));
  const noise = createNoise(hashSeed(seed, 'plan', 'noise'));
  const W = u.widthUnits;
  const H = SCROLL_H;
  const mh = Math.max(0, params.mountainHeight);
  const sp = Math.min(1, Math.max(0, params.spacing));
  const gap = minGap(sp);
  const out: Placement[] = [];
  if (mh <= 0) return out;

  // 1. Cluster centres: the best-scoring x positions of a slow noise curve, at least `gap` apart.
  const xs: number[] = [];
  for (let x = EDGE; x <= W - EDGE; x += STEP) xs.push(x);
  const raw = (x: number) => noise.fbm1(x / 400, 3);
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of xs) {
    lo = Math.min(lo, raw(x));
    hi = Math.max(hi, raw(x));
  }
  const score = (x: number) => (hi > lo ? (raw(x) - lo) / (hi - lo) : 1);
  xs.sort((a, b) => score(b) - score(a) || a - b);
  const centres: number[] = [];
  for (const x of xs) if (!centres.some((c) => Math.abs(c - x) < gap)) centres.push(x);

  // 2. Each centre is a cluster of mountains at several depths (feet at different y), jittered in
  //    x, so nearer ones overlap farther ones: that overlap is what reads as depth.
  const spread = 160 + 140 * sp;
  for (const c of centres) {
    const s = score(c);
    const n = 2 + rng.int(2) + (s > 0.6 ? 1 : 0);
    for (let j = 0; j < n; j++) {
      const t = (j + rng.next()) / n; // 0 = farthest back in the cluster, 1 = nearest
      const y = lerp(DEPTH.mountTop, DEPTH.mountBottom, t) * H;
      const height = mh * lerp(260, 900, s) * rng.range(0.55, 1.05) * (0.8 + 0.3 * t);
      if (height < 4) continue;
      const kind = j > 0 && rng.chance(0.2) ? 'flat' : 'peak';
      out.push({
        kind,
        x: Math.min(W, Math.max(0, c + rng.range(-1, 1) * spread)),
        y,
        halfWidth: height * rng.range(0.55, 0.9) + 60,
        height: kind === 'flat' ? height * 0.55 : height,
        depth: y > DEPTH.split * H ? 'near' : 'mid',
        seed: 0,
      });
    }
  }

  // 3. Low flat mountains in the wide gaps between clusters, toward the front.
  const sorted = [...centres].sort((a, b) => a - b);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (b - a < 1.4 * gap || !rng.chance(0.6)) continue;
    const y = rng.range(0.8, 0.92) * H;
    out.push({ kind: 'flat', x: (a + b) / 2 + rng.range(-60, 60), y, halfWidth: rng.range(220, 380), height: mh * rng.range(110, 200), depth: 'near', seed: 0 });
  }

  // 4. Distant ridges, high on the page, across the whole scroll (background plane).
  const farRng = new Rng(hashSeed(seed, 'plan', 'far'));
  for (let x = farRng.range(-100, 150); x < W + 200; x += farRng.range(380, 760)) {
    out.push({
      kind: 'far',
      x: Math.min(W, Math.max(0, x)),
      y: farRng.range(DEPTH.farTop, DEPTH.farBottom) * H,
      halfWidth: farRng.range(320, 560),
      height: mh * farRng.range(170, 330),
      depth: 'far',
      seed: 0,
    });
  }

  out.forEach((q, i) => (q.seed = hashSeed(seed, 'mount', i)));
  return out;
}

const cache = new WeakMap<Blueprint, Placement[]>();

/** The blueprint's plan, computed once and shared by every feature. */
export function planOf(bp: Blueprint): Placement[] {
  let pl = cache.get(bp);
  if (!pl) {
    pl = makePlan(bp.seed, bp.params, artOf(bp).u);
    cache.set(bp, pl);
  }
  return pl;
}
