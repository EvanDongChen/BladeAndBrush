import { createBlueprint, type Blueprint } from '../core/blueprint';
import { featureOn } from '../core/config';
import { DEFAULT_DIMS, type LevelDims } from '../core/constants';
import { features, type Feature, type FeatureCtx } from '../core/features';
import { createNoise } from '../core/noise';
import type { GenParams } from '../core/params';
import { byOrder } from '../core/registry';
import { hashSeed, Rng } from '../core/rng';

export interface GenerateOptions {
  dims?: LevelDims;
  /** Per-call feature toggles; win over core/config.ts featureToggles. */
  features?: Record<string, boolean>;
}

/** Registered features that are switched on, in pipeline order. */
export function enabledFeatures(overrides?: Record<string, boolean>): Feature[] {
  return features
    .all()
    .filter((f) => featureOn(f.name, overrides))
    .sort(byOrder);
}

/**
 * Pure: same (seed, params, options) and same registered features give the same Blueprint.
 * Runs every enabled feature in order; each gets its own rng/noise derived from the seed.
 */
export function generate(seed: number, params: GenParams, opts: GenerateOptions = {}): Blueprint {
  const dims = opts.dims ?? DEFAULT_DIMS;
  const bp = createBlueprint(seed, params, dims);
  let nextOwner = 1;
  const newStroke: FeatureCtx['newStroke'] = (info) => {
    const id = nextOwner++;
    bp.registry.strokes.set(id, { id, ...info });
    return id;
  };
  for (const f of enabledFeatures(opts.features)) {
    f.run({
      seed,
      params: bp.params,
      dims,
      bp,
      rng: new Rng(hashSeed(seed, f.name)),
      noise: createNoise(hashSeed(seed, f.name, 'noise')),
      newStroke,
    });
  }
  return bp;
}
