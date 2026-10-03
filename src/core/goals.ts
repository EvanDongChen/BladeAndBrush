import { ExtensionRegistry } from './registry';
import type { ScanResult } from './scan';

/** A goal as written in a level file, e.g. { type: 'metric', metric: 'trees', op: '>=', n: 5 }. */
export interface GoalSpec {
  type: string;
  [arg: string]: unknown;
}

export interface GoalResult {
  pass: boolean;
  /** 0..1, for the HUD. */
  progress: number;
}

export type GoalFn = (scan: ScanResult, args: GoalSpec) => GoalResult;

export interface GoalType {
  type: string;
  evaluate: GoalFn;
  /** Human-readable text for a spec, for the HUD. */
  describe?: (args: GoalSpec) => string;
}

export const goalTypes = new ExtensionRegistry<GoalType>('goal', (g) => g.type);

/** Drop a file into levels/goals/ that calls this. */
export function registerGoal(type: string, evaluate: GoalFn, describe?: GoalType['describe']): GoalType {
  return goalTypes.register({ type, evaluate, describe });
}

/** Throws on an unknown goal type, so a typo in a level file fails loudly. */
export function evaluateGoal(scan: ScanResult, spec: GoalSpec): GoalResult {
  const g = goalTypes.get(spec.type);
  if (!g) throw new Error(`Unknown goal type "${spec.type}"`);
  return g.evaluate(scan, spec);
}

export function describeGoal(spec: GoalSpec): string {
  return goalTypes.get(spec.type)?.describe?.(spec) ?? JSON.stringify(spec);
}
