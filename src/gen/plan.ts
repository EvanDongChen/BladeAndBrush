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
/** Most of the scroll the near + mid mountains may cover together. */
const COVER_MAX = 0.55;

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
  const gap = minGap(params.spacing);
  const out: Placement[] = [];

  // Union of the near + mid footprints on a STEP grid: mountains are part of the painting, not
  // all of it, so together they may cover at most COVER_MAX of the scroll.
  const cells = Math.ceil(W / STEP) + 1;
  const covered = new Uint8Array(cells);
  let coveredCount = 0;
  const span = (x: number, hw: number): [number, number] => [
    Math.max(0, Math.floor((x - hw) / STEP)),
    Math.min(cells - 1, Math.ceil((x + hw) / STEP)),
  ];
  const wouldCover = (x: number, hw: number) => {
    const [a, b] = span(x, hw);
    let n = 0;
    for (let i = a; i <= b; i++) if (!covered[i]) n++;
    return n;
  };
  const cover = (x: number, hw: number) => {
    const [a, b] = span(x, hw);
    for (let i = a; i <= b; i++) if (!covered[i]) (covered[i] = 1), coveredCount++;
  };
  // Open land between neighbours in a row grows with the spacing slider.
  const sp = Math.min(1, Math.max(0, params.spacing));
  const landGap = lerp(20, 450, sp);
  // Tight spacing packs more, slimmer mountains; loose spacing fewer, broader ones.
  const widthScale = lerp(0.45, 1, sp);

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
    const kept: { x: number; hw: number }[] = [];
    for (const x of xs) {
      const height = params.mountainHeight * lerp(300, 1000, score(x)) * heightScale;
      // Width from noise at x (not the rng), so rejected candidates do not shift later draws.
      const hw = height * lerp(0.5, 0.85, noise.n1(x * 0.37 + offset)) * widthScale + 30;
      if (kept.some((k) => Math.abs(k.x - x) < Math.max(rowGap, k.hw + hw + landGap))) continue;
      if (coveredCount > 0 && coveredCount + wouldCover(x, hw) > COVER_MAX * cells) continue;
      kept.push({ x, hw });
      cover(x, hw);
      // The best spot in a row is always a peak; lower ones are sometimes plateaus.
      const kind = kept.length > 1 && rng.chance(0.25) ? 'flat' : 'peak';
      out.push({ kind, x, halfWidth: hw, height: kind === 'flat' ? height * 0.6 : height, depth, seed: 0 });
    }
  };
  row('near', gap, 0, 1);
  row('mid', 0.7 * gap, 1000, 0.75);

  // Far row (background plane): overlapping low ridges across the whole scroll. Its own rng, so
  // adding or tuning it never moves the near/mid mountains.
  const farRng = new Rng(hashSeed(seed, 'plan', 'far'));
  for (let x = farRng.range(-100, 150); x < W + 200; x += farRng.range(280, 520)) {
    const score = noise.fbm1(x / 400 + 2000, 3);
    out.push({
      kind: 'far',
      x: Math.min(W, Math.max(0, x)),
      halfWidth: farRng.range(260, 420),
      height: params.mountainHeight * lerp(260, 560, Math.min(1, Math.max(0, (score - 0.25) * 2))),
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
