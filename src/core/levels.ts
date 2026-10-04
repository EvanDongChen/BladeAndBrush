import type { LevelDims } from './constants';
import type { GoalSpec } from './goals';
import { ExtensionRegistry } from './registry';
import type { SetpieceSpec } from './setpieces';

export interface LevelParam {
  value: number;
  /** Player cannot change it. */
  locked?: boolean;
  /** Shown in the UI at all. */
  visible?: boolean;
  /** What the slider is called on this level (default: the param's own label). */
  label?: string;
  /** The range the player may tune it in on this level (default: the param's whole range). */
  min?: number;
  max?: number;
}

/** Levels are plain data. Drop a file into levels/ that calls registerLevel(). */
export interface LevelDef {
  id: string;
  /** Shown on the scroll and the level page (default: the id). */
  title?: string;
  /** A hint shown with the sliders: what tuning the painting can do for this puzzle. */
  tip?: string;
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
  /** What this level puts into the painting whatever the sliders say (core/setpieces.ts). */
  setpieces?: SetpieceSpec[];
}

export const levels = new ExtensionRegistry<LevelDef>('level', (l) => l.id);

export function registerLevel(def: LevelDef): LevelDef {
  return levels.register(def);
}
