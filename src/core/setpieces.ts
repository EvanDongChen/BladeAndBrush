import type { FeatureCtx } from './features';
import { ExtensionRegistry } from './registry';

/**
 * Setpieces: what a level asks the generator to put in, on top of the free painting. A level lists
 * specs (`{ type: 'moon', x: 0.5, y: 0.2 }`); everything else still comes from the seed and the
 * player's sliders, so the level's story is always there while the rest stays tunable.
 *
 * Positions in specs are fractions of the scroll (0..1) unless a setpiece says otherwise, so a
 * level works at any LevelDims.
 */
export interface SetpieceSpec {
  type: string;
  [arg: string]: unknown;
}

/** Drop a file into gen/setpieces/ that calls registerSetpiece(). */
export interface Setpiece {
  type: string;
  label?: string;
  /**
   * Where it runs in the generator pipeline, on the same scale as Feature.order (mountains 10,
   * ground 15, trees 20). Omit for setpieces that only steer the plan (see `clears`).
   */
  order?: number;
  /**
   * Stretches of the scroll (0..1) the planned mountains must leave free for this setpiece, e.g.
   * open ground for a village or open sky under the moon.
   */
  clears?(spec: SetpieceSpec): [x0: number, x1: number][];
  run?(ctx: FeatureCtx, spec: SetpieceSpec): void;
}

export const setpieces = new ExtensionRegistry<Setpiece>('setpiece', (s) => s.type);

export function registerSetpiece(s: Setpiece): Setpiece {
  return setpieces.register(s);
}

/** Throws on an unknown type, so a typo in a level file fails loudly. */
export function setpieceOf(spec: SetpieceSpec): Setpiece {
  const s = setpieces.get(spec.type);
  if (!s) throw new Error(`Unknown setpiece type "${spec.type}"`);
  return s;
}

/** Read a numeric arg with a default. */
export function num(spec: SetpieceSpec, key: string, fallback: number): number {
  const v = spec[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
