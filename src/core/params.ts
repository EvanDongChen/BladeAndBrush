import { ExtensionRegistry } from './registry';

/**
 * Params are data. Both test pages build their sliders from this schema, so adding a param is
 * one line here (or one registerParam() call in your own module) plus reading it where it is used.
 */
export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface GenParams {
  mountainHeight: number;
  ruggedness: number;
  spacing: number;
  treeDensity: number;
  /** Read by B's behaviors: max fall steps per tick for WATER, ASH, SPLAT. */
  gravity: number;
  [key: string]: number;
}

export const params = new ExtensionRegistry<ParamDef>('param', (p) => p.key);

export function registerParam(def: ParamDef): ParamDef {
  return params.register(def);
}

registerParam({ key: 'mountainHeight', label: 'Mountain height', min: 0, max: 1, step: 0.01, default: 0.5 });
registerParam({ key: 'ruggedness', label: 'Ruggedness', min: 1, max: 8, step: 1, default: 4 });
registerParam({ key: 'spacing', label: 'Spacing', min: 0, max: 1, step: 0.01, default: 0.5 });
registerParam({ key: 'treeDensity', label: 'Tree density', min: 0, max: 1, step: 0.01, default: 0.4 });
registerParam({ key: 'gravity', label: 'Gravity', min: 1, max: 8, step: 1, default: 2 });

/** Fresh params object with every registered param at its default. */
export function defaultParams(): GenParams {
  const out: Record<string, number> = {};
  for (const p of params.all()) out[p.key] = p.default;
  return out as GenParams;
}
