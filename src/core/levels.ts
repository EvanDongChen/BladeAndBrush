import type { LevelDims } from './constants';
import type { GoalSpec } from './goals';
import { ExtensionRegistry } from './registry';

export interface LevelParam {
  value: number;
  /** Player cannot change it. */
  locked?: boolean;
  /** Shown in the UI at all. */
  visible?: boolean;
}

/** Levels are plain data. Drop a file into levels/ that calls registerLevel(). */
export interface LevelDef {
  id: string;
  /** One line per array entry. */
  poem: string[];
  dims: LevelDims;
  seed: number;
  params: Record<string, LevelParam>;
  goals: GoalSpec[];
  /** Ability uses allowed per round. */
  actionBudget: number;
  /** Generator feature toggles for this level (missing = enabled). */
  featuresEnabled?: Record<string, boolean>;
}

export const levels = new ExtensionRegistry<LevelDef>('level', (l) => l.id);

export function registerLevel(def: LevelDef): LevelDef {
  return levels.register(def);
}
