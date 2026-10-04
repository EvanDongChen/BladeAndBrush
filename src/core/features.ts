import type { Blueprint, StrokeInfo } from './blueprint';
import type { LevelDims } from './constants';
import type { Noise } from './noise';
import type { GenParams } from './params';
import { ExtensionRegistry } from './registry';
import type { Rng } from './rng';

/** What a generator feature gets. rng and noise are seeded per feature, so toggling one feature
 * does not change the output of the others. */
export interface FeatureCtx {
  seed: number;
  params: GenParams;
  dims: LevelDims;
  rng: Rng;
  noise: Noise;
  bp: Blueprint;
  /**
   * Allocate an object id (core/objects.ts) and add it to the blueprint registry: a painted stroke
   * (its cells get it as owner and obj) or anything else worth tracking, e.g. a creature to spawn.
   */
  newStroke(info: Omit<StrokeInfo, 'id'>): number;
}

/** One stage of generate(). Drop a file into gen/features/ that calls registerFeature(). */
export interface Feature {
  name: string;
  label?: string;
  /** Lower runs first. */
  order: number;
  run(ctx: FeatureCtx): void;
}

export const features = new ExtensionRegistry<Feature>('feature', (f) => f.name);

export function registerFeature(f: Feature): Feature {
  return features.register(f);
}
