import { ExtensionRegistry } from '../core/registry';

/** [min, max, step] for a tunable's slider. */
export type Range = [number, number, number];

export interface TunableGroup {
  name: string;
  /** The live values object. Behaviors and abilities read it directly, so edits apply instantly. */
  values: Record<string, number>;
  ranges: Record<string, Range>;
}

/**
 * Feel knobs for behaviors and abilities (PLAN.md section 12.3). The sandbox builds a slider for
 * every registered value. They are not recorded in the action log, so change them before
 * recording, not during.
 */
export const tunables = new ExtensionRegistry<TunableGroup>('tunables', (g) => g.name);

export function defineTunables<T extends Record<string, number>>(name: string, defaults: T, ranges: { [K in keyof T]: Range }): T {
  const values = { ...defaults };
  tunables.register({ name, values, ranges });
  return values;
}
