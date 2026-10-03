import type { Blueprint } from '../core/blueprint';
import { createNoise } from '../core/noise';
import type { GenParams } from '../core/params';
import { hashSeed, Rng } from '../core/rng';
import { artOf } from './artState';
import type { Units } from './units';

export type Depth = 'near' | 'mid' | 'far';

/** One thing to draw, in painting units. `kind` names a registered shape. */
export interface Placement {
  kind: string;
  x: number;
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
 * - A slow noise curve scores every x; the best-scoring xs become peaks, greedily kept at least
 *   minGap apart (near row) or 0.7 * minGap apart (mid row, its own curve).
 * - Long stretches no mountain covers get a low flat plateau.
 */
export function makePlan(seed: number, params: GenParams, u: Units): Placement[] {
  const rng = new Rng(hashSeed(seed, 'plan'));
  const noise = createNoise(hashSeed(seed, 'plan', 'noise'));
  const W = u.widthUnits;
  const gap = minGap(params.spacing);
  const out: Placement[] = [];

  const row = (depth: Depth, rowGap: number, offset: number, heightScale: number) => {
    const xs: number[] = [];
    for (let x = EDGE; x <= W - EDGE; x += STEP) xs.push(x);
    const raw = (x: number) => noise.fbm1(x / 400 + offset, 3);
    let lo = Infinity;
    let hi = -Infinity;
    for (const x of xs) {
      lo = Math.min(lo, raw(x));
      hi = Math.max(hi, raw(x));
    }
    // Stretch to 0..1 so peak heights use the whole range, whatever this seed's noise spread.
    const score = (x: number) => (hi > lo ? (raw(x) - lo) / (hi - lo) : 1);
    xs.sort((a, b) => score(b) - score(a) || a - b);
    const kept: number[] = [];
    for (const x of xs) {
      if (kept.some((k) => Math.abs(k - x) < rowGap)) continue;
      kept.push(x);
      const height = params.mountainHeight * lerp(300, 1000, score(x)) * heightScale;
      out.push({ kind: 'peak', x, halfWidth: height * rng.range(0.5, 0.85) + 40, height, depth, seed: 0 });
    }
  };
  row('near', gap, 0, 1);
  row('mid', 0.7 * gap, 1000, 0.75);

  // Coverage gaps -> flat plateaus in the near row.
  const cells = Math.ceil(W / STEP) + 1;
  const covered = new Uint8Array(cells);
  for (const q of out) {
    const a = Math.max(0, Math.floor((q.x - q.halfWidth) / STEP));
    const b = Math.min(cells - 1, Math.ceil((q.x + q.halfWidth) / STEP));
    for (let i = a; i <= b; i++) covered[i] = 1;
  }
  for (let i = 0; i < cells; ) {
    if (covered[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < cells && !covered[j]) j++;
    const run = (j - i) * STEP;
    if (run > 0.8 * gap) {
      out.push({
        kind: 'flat',
        x: Math.min(W, (i * STEP + j * STEP) / 2),
        halfWidth: run / 2 + 30,
        height: params.mountainHeight * rng.range(140, 220),
        depth: 'near',
        seed: 0,
      });
    }
    i = j;
  }

  // Far row (background plane): overlapping low ridges across the whole scroll. Its own rng, so
  // adding or tuning it never moves the near/mid mountains.
  const farRng = new Rng(hashSeed(seed, 'plan', 'far'));
  for (let x = farRng.range(-100, 150); x < W + 200; x += farRng.range(280, 520)) {
    const score = noise.fbm1(x / 400 + 2000, 3);
    out.push({
      kind: 'far',
      x: Math.min(W, Math.max(0, x)),
      halfWidth: farRng.range(260, 420),
      height: params.mountainHeight * lerp(140, 320, Math.min(1, Math.max(0, (score - 0.25) * 2))),
      depth: 'far',
      seed: 0,
    });
  }

  const kept = out.filter((q) => q.height >= 4);
  kept.forEach((q, i) => (q.seed = hashSeed(seed, 'mount', i)));
  return kept;
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
