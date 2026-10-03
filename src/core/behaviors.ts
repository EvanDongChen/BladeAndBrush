import { elementName } from './elements';
import { ExtensionRegistry } from './registry';
import type { World } from './world';

/**
 * Per-element update rule. Called once per cell per tick (cells already UPDATED this tick are
 * skipped). All randomness via world.rng. Elements without a behavior are static (no-op), which
 * is all core ships with.
 */
export type BehaviorFn = (world: World, x: number, y: number) => void;

export interface Behavior {
  el: number;
  fn: BehaviorFn;
}

export const behaviors = new ExtensionRegistry<Behavior>('behavior', (b) => b.el, (b) => elementName(b.el));

/** Hot-loop lookup by element id. */
export const BEHAVIORS: (BehaviorFn | undefined)[] = new Array(256).fill(undefined);

export function registerBehavior(el: number, fn: BehaviorFn): void {
  behaviors.register({ el, fn });
  BEHAVIORS[el] = fn;
}

/** Whole-grid pass, e.g. water-source emitters, fire spread, stain fade. */
export interface Pass {
  name: string;
  /** 'pre' runs before the per-cell behaviors, 'post' after. */
  phase: 'pre' | 'post';
  order: number;
  run(world: World): void;
}

export const passes = new ExtensionRegistry<Pass>('pass', (p) => p.name);

export function registerPass(p: Pass): Pass {
  return passes.register(p);
}
