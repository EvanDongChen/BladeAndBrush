import type { Blueprint } from '../core/blueprint';
import { createNoise } from '../core/noise';
import type { GenParams } from '../core/params';
import { hashSeed, Rng } from '../core/rng';
import { setpieceOf, type PlannedMountain } from '../core/setpieces';
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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** What the level's setpieces ask of the plan (core/setpieces.ts), in fractions of the scroll. */
export interface PlanHints {
  /** Planned first; the free mountains keep their distance. */
  mountains: PlannedMountain[];
  /** Spans [x0, x1] that no free mountain or plateau may cover. */
  clear: [number, number][];
}

/** Plan hints from a blueprint's setpieces, or undefined for a free painting. */
export function hintsOf(bp: Blueprint): PlanHints | undefined {
  if (bp.setpieces.length === 0) return undefined;
  const hints: PlanHints = { mountains: [], clear: [] };
  for (const spec of bp.setpieces) {
    const sp = setpieceOf(spec);
    hints.mountains.push(...(sp.places?.(spec) ?? []));
    for (const [a, b] of sp.clears?.(spec) ?? []) hints.clear.push([Math.min(a, b), Math.max(a, b)]);
  }
  return hints;
}

/** Minimum distance between peaks in the near row; `spacing` is the 0..1 slider. */
export function minGap(spacing: number): number {
  return lerp(150, 700, Math.min(1, Math.max(0, spacing)));
}

/** Step-1 inputs of the near-row picker, as pure data. */
export interface ScoreCurve {
  /** Sample positions, painting units. */
  xs: number[];
  /** Noise score per sample, normalized 0..1. */
  score: number[];
  /** Acceptance bar: samples at or above this become peak candidates. */
  bar: number;
  /** Greedy minimum separation between picks, painting units. */
  minApart: number;
}

/**
 * The soundwave the planner picks peaks from. Pure: same (seed, spacing,
 * width) gives the same curve, and makePlan() below consumes exactly this,
 * so pages can draw the same curve the mountains come from. Editorial
 * overrides (the noise-graph gate) pass barOver; otherwise the bar follows
 * spacing, exactly as before.
 */
export function scoreCurve(seed: number, spacing: number, widthUnits: number, barOver?: number): ScoreCurve {
  const noise = createNoise(hashSeed(seed, 'plan', 'noise'));
  const sp = Math.min(1, Math.max(0, spacing));
  const samp = 0.03 * lerp(1.35, 0.7, sp);
  const xs: number[] = [];
  for (let x = 0; x <= widthUnits; x += STEP / 2) xs.push(x);
  const raw = xs.map((x) => noise.fbm1(x * samp, 4));
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of raw) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const score = raw.map((v) => (hi > lo ? (v - lo) / (hi - lo) : 0));
  return { xs, score, bar: barOver ?? lerp(0.72, 0.86, sp), minApart: lerp(260, 700, sp) };
}

/**
 * Where the mountains go. Pure: same (seed, params, units) gives the same plan.
 * - A slow noise curve scores every x; the best-scoring xs become mountains, greedily kept at
 *   least minGap apart (near row) or 0.7 * minGap apart (mid row, its own curve), and never
 *   touching a neighbour in their row (a land gap that grows with spacing).
 * - Together the near and mid rows cover at most COVER_MAX of the scroll, so land shows.
 */
export function makePlan(seed: number, params: GenParams, u: Units, hints?: PlanHints, barOver?: number): Placement[] {
  const rng = new Rng(hashSeed(seed, 'plan'));
  const noise = createNoise(hashSeed(seed, 'plan', 'noise'));
  const W = u.widthUnits;
  const H = SCROLL_H;
  const mh = Math.max(0, params.mountainHeight) * 2; // the slider's middle (0.5) is the reference size
  const sp = Math.min(1, Math.max(0, params.spacing));
  const out: Placement[] = [];
  if (mh <= 0) return out;
  const depthOf = (y: number): Depth => (y > DEPTH.split * H ? 'near' : 'mid');
  /** Would a free mountain or plateau at x, this wide, cover a span a setpiece keeps clear? */
  const blocked = (x: number, hw: number) => hints?.clear.some(([a, b]) => x + hw > a * W && x - hw < b * W) ?? false;

  // 0. The level's own mountains (setpieces), before anything else.
  const forced: number[] = [];
  for (const f of hints?.mountains ?? []) {
    const flat = f.kind === 'flat';
    const h = Math.max(0, Math.min(2.5, f.height ?? 1));
    const y = (f.y ?? (flat ? 0.88 : 0.9)) * H;
    const x = f.x * W;
    const halfWidth = f.halfWidth !== undefined ? f.halfWidth * W : flat ? 340 : 250;
    out.push({ kind: flat ? 'flat' : 'peak', x, y, halfWidth, height: mh * (flat ? lerp(70, 130, h) : lerp(100, 500, h)), depth: depthOf(y), seed: 0 });
    if (!flat) forced.push(x);
  }

  // 1. Where mountains rise: high points of a noise curve along x. Tighter spacing = a faster
  //    curve and a lower bar, so more of them.
  const { xs, score, bar, minApart } = scoreCurve(seed, params.spacing, W, barOver);
  const peaks: number[] = [...forced]; // free clusters keep their distance from the level's peaks
  const order = xs.map((_, i) => i).sort((a, b) => score[b] - score[a]);
  for (const i of order) {
    if (score[i] < bar) break;
    if (peaks.some((q) => Math.abs(q - xs[i]) < minApart)) continue;
    peaks.push(xs[i]);
  }

  // 2. At each, a stack of mountains at several depths (feet every 30 units from the back), jittered
  //    sideways: the nearer ones overlap the farther ones, which is what reads as depth.
  const cover = new Uint8Array(Math.ceil(W / STEP) + 1);
  for (const q of out) for (let c = Math.max(0, Math.floor((q.x - q.halfWidth) / STEP)); c <= Math.min(cover.length - 1, Math.ceil((q.x + q.halfWidth) / STEP)); c++) cover[c] = 1;
  const taken: number[] = [];
  const jitter = 260 * (0.5 + 0.5 * sp);
  for (const px of peaks.slice(forced.length)) {
    // 2-4 mountains per cluster, their feet spread through the depth range
    const count = 2 + Math.floor(noise.n1(px * 0.01 + 31.4) * 2.99);
    const start = rng.range(0, 0.3);
    for (let k = 0; k < count; k++) {
      const y = lerp(DEPTH.mountTop, DEPTH.mountBottom, Math.min(1, start + (k / count) * 0.75 + rng.range(0, 0.1))) * H;
      if (y > DEPTH.mountBottom * H) break;
      const x = Math.min(W, Math.max(0, px + rng.range(-1, 1) * jitter));
      if (taken.some((t) => Math.abs(t - x) < 10)) continue;
      taken.push(x);
      const halfWidth = rng.range(200, 300);
      const height = mh * rng.range(100, 500);
      if (blocked(x, halfWidth)) continue;
      out.push({ kind: 'peak', x, y, halfWidth, height, depth: depthOf(y), seed: 0 });
      for (let c = Math.max(0, Math.floor((x - 200) / STEP)); c <= Math.min(cover.length - 1, Math.ceil((x + 200) / STEP)); c++) cover[c] = 1;
    }
  }

  // 3. Plateaus (flat mountains) in the open stretches between clusters: the foreground land.
  for (let c = 0; c < cover.length; ) {
    if (cover[c]) {
      c++;
      continue;
    }
    let e = c;
    while (e < cover.length && !cover[e]) e++;
    const run = (e - c) * STEP;
    if (run >= 260) {
      const n = 1 + rng.int(run > 700 ? 3 : 2);
      for (let j = 0; j < n; j++) {
        const y = lerp(DEPTH.flatBottom, DEPTH.flatTop, (j + rng.next()) / 3) * H;
        const x = c * STEP + run * rng.range(0.2, 0.8);
        const halfWidth = Math.min(run * 0.6, rng.range(260, 420));
        const height = mh * rng.range(80, 130);
        if (blocked(x, halfWidth)) continue;
        out.push({ kind: 'flat', x, y, halfWidth, height, depth: depthOf(y), seed: 0 });
      }
    }
    c = e;
  }

  // 3b. The foreground band: plateaus along the bottom of the scroll, in front of everything
  //     (they overlap the mountains' feet), so there is always land, rocks and trees nearby.
  for (let x = rng.range(-100, 250); x < W + 100; x += rng.range(420, 820) * lerp(0.8, 1.3, sp)) {
    if (!rng.chance(0.8)) continue;
    const y = rng.range(0.82, 0.95) * H;
    const fx = Math.min(W, Math.max(0, x));
    const halfWidth = rng.range(260, 440);
    const height = mh * rng.range(70, 120);
    if (blocked(fx, halfWidth)) continue;
    out.push({ kind: 'flat', x: fx, y, halfWidth, height, depth: depthOf(y), seed: 0 });
  }

  // 4. Distant ridges, high on the page, across the whole scroll (background plane).
  const farRng = new Rng(hashSeed(seed, 'plan', 'far'));
  for (let x = farRng.range(-300, 100); x < W + 300; x += farRng.range(700, 1100)) {
    out.push({
      kind: 'far',
      x: Math.min(W, Math.max(0, x)),
      y: farRng.range(DEPTH.farTop, DEPTH.farBottom) * H,
      halfWidth: [250, 500, 750][farRng.int(3)],
      height: mh * farRng.range(110, 170),
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
    pl = makePlan(bp.seed, bp.params, artOf(bp).u, hintsOf(bp), bp.planBar);
    cache.set(bp, pl);
  }
  return pl;
}
