import { createBlueprint, flattenPlanes, type Blueprint } from '../core/blueprint';
import { featureOn } from '../core/config';
import { DEFAULT_DIMS, type LevelDims } from '../core/constants';
import { features, type Feature, type FeatureCtx } from '../core/features';
import { IS_STATIC } from '../core/elements';
import { createNoise } from '../core/noise';
import type { GenParams } from '../core/params';
import { byOrder } from '../core/registry';
import { hashSeed, Rng } from '../core/rng';
import { setpieceOf, type SetpieceSpec } from '../core/setpieces';
import { attachArt, DEFAULT_ART_K } from './artState';
import { mountainsOf } from './mountainStore';

export interface GenerateOptions {
  dims?: LevelDims;
  /** Per-call feature toggles; win over core/config.ts featureToggles. */
  features?: Record<string, boolean>;
  /** Art pixels per cell side (default DEFAULT_ART_K). */
  k?: number;
  /** What the level puts in on top of the free painting (core/setpieces.ts). */
  setpieces?: SetpieceSpec[];
}

/** Registered features that are switched on, in pipeline order. */
export function enabledFeatures(overrides?: Record<string, boolean>): Feature[] {
  return features
    .all()
    .filter((f) => featureOn(f.name, overrides))
    .sort(byOrder);
}

/** One pipeline step: a feature, or one setpiece spec that has a run(). */
interface Stage {
  name: string;
  order: number;
  run(ctx: FeatureCtx): void;
}

/**
 * Features plus the level's setpieces, in order. A setpiece runs right after the features with
 * the same order; several specs of one type run in the order the level lists them.
 */
function pipeline(specs: SetpieceSpec[], overrides?: Record<string, boolean>): Stage[] {
  const stages: Stage[] = enabledFeatures(overrides).map((f) => ({ name: f.name, order: f.order, run: (ctx) => f.run(ctx) }));
  specs.forEach((spec, i) => {
    const s = setpieceOf(spec);
    if (s.run && s.order !== undefined) stages.push({ name: `setpiece:${spec.type}:${i}`, order: s.order + 0.5, run: (ctx) => s.run!(ctx, spec) });
  });
  return stages.sort(byOrder);
}

/**
 * Pure: same (seed, params, options) and same registered features give the same Blueprint.
 * Runs every enabled feature (and setpiece) in order; each gets its own rng/noise derived from the seed.
 */
export function generate(seed: number, params: GenParams, opts: GenerateOptions = {}): Blueprint {
  const dims = opts.dims ?? DEFAULT_DIMS;
  const bp = createBlueprint(seed, params, dims, opts.setpieces);
  attachArt(bp, opts.k ?? DEFAULT_ART_K);
  let nextOwner = 1;
  const newStroke: FeatureCtx['newStroke'] = (info) => {
    const id = nextOwner++;
    bp.registry.strokes.set(id, { id, ...info });
    return id;
  };
  for (const stage of pipeline(bp.setpieces, opts.features)) {
    stage.run({
      seed,
      params: bp.params,
      dims,
      bp,
      rng: new Rng(hashSeed(seed, stage.name)),
      noise: createNoise(hashSeed(seed, stage.name, 'noise')),
      newStroke,
    });
  }
  markFeet(bp);
  flattenPlanes(bp); // layered pixels: planes -> front cells + the stack behind them
  anchorLoose(bp);
  return bp;
}

/**
 * The painting has no ground strip: mountains and plateaus stand on land that is only implied. Mark
 * the bottom cell of each of their columns (bp.foot, revealed as Flag.FOOT) so the sim knows they
 * rest on something; anything cut loose above that still falls.
 */
function markFeet(bp: Blueprint): void {
  const planes = bp.planes;
  if (!planes) return;
  const foot = (bp.foot = new Uint8Array(bp.w * bp.h));
  for (const m of mountainsOf(bp)) {
    const info = bp.registry.strokes.get(m.id);
    if (!info) continue;
    const g = planes[m.plane];
    const [x0, y0, x1, y1] = info.bbox;
    for (let x = Math.max(0, x0); x <= Math.min(bp.w - 1, x1); x++) {
      for (let y = Math.min(bp.h - 1, y1); y >= Math.max(0, y0); y--) {
        const i = y * bp.w + x;
        if (g.owner[i] === m.id && g.el[i] !== 0) {
          foot[i] = 1;
          break;
        }
      }
    }
  }
}

/**
 * Bits of the painting that are not joined to any foot as generated (a canopy the rasterizer left
 * a cell apart from its trunk, a sliver of rock) are part of the picture, not loose: mark them
 * bp.cling, so they hold on to whatever is next to them and only fall once that is cut or burnt away.
 */
function anchorLoose(bp: Blueprint): void {
  const foot = bp.foot;
  if (!foot) return;
  const cling = (bp.cling = new Uint8Array(bp.w * bp.h));
  const { w, h, el } = bp;
  const size = w * h;
  const seen = new Uint8Array(size);
  const stack = new Int32Array(size);
  let top = 0;
  const solid = (i: number) => el[i] !== 0 && IS_STATIC[el[i]] === 1;
  const visit = (i: number) => {
    if (!seen[i] && solid(i)) {
      seen[i] = 1;
      stack[top++] = i;
    }
  };
  const flood = () => {
    while (top > 0) {
      const i = stack[--top];
      const x = i % w;
      if (x > 0) visit(i - 1);
      if (x < w - 1) visit(i + 1);
      if (i >= w) visit(i - w);
      if (i < size - w) visit(i + w);
    }
  };
  for (let i = 0; i < size; i++) if (foot[i] || i >= (h - 1) * w) visit(i);
  flood();
  for (let i = 0; i < size; i++) if (solid(i) && !seen[i]) cling[i] = 1;
}
