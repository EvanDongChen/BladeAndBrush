import { createBlueprint, flattenPlanes, type Blueprint } from '../core/blueprint';
import { featureOn } from '../core/config';
import { DEFAULT_DIMS, type LevelDims } from '../core/constants';
import { features, type Feature, type FeatureCtx } from '../core/features';
import { createNoise } from '../core/noise';
import type { GenParams } from '../core/params';
import { byOrder } from '../core/registry';
import { hashSeed, Rng } from '../core/rng';
import { setpieceOf, type SetpieceSpec } from '../core/setpieces';
import { attachArt, DEFAULT_ART_K } from './artState';

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
  flattenPlanes(bp); // layered pixels: planes -> front cells + the stack behind them
  return bp;
}
