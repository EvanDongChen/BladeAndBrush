import type { Blueprint } from '../core/blueprint';
import type { Depth } from './plan';
import type { Profile } from './shapes';

/** A painted mountain, as later features (trees, ...) need it. */
export interface MountainRec {
  id: number;
  depth: Depth;
  /** The generator plane the mountain is in (PLANE.NEAR or PLANE.MID). */
  plane: number;
  profile: Profile;
}

/** Gen-only, per blueprint: filled by the mountains feature, read by features that run after it. */
const store = new WeakMap<Blueprint, MountainRec[]>();

export function recordMountain(bp: Blueprint, rec: MountainRec): void {
  let list = store.get(bp);
  if (!list) store.set(bp, (list = []));
  list.push(rec);
}

/** Mountains painted so far, back to front. Empty if the mountains feature is off. */
export function mountainsOf(bp: Blueprint): readonly MountainRec[] {
  return store.get(bp) ?? [];
}
