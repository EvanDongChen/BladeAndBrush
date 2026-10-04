import { objectsOf, type ObjectIndex, type WorldObject } from '../../core/objects';
import { registerMetric } from '../../core/scan';
import type { World } from '../../core/world';
import { skyReach } from '../scan';

/**
 * Captive animals (setpiece 'captives'): the fraction that are free, i.e. alive with open air
 * (empty space, gas or other creatures; not rock, wood, water...) all the way up to the top of the
 * sky. 1 if the level has none.
 */
registerMetric(
  'animalsFreed',
  (world, { objects }) => {
    const all = objectsOf(world, null, 'captive');
    return all.length === 0 ? 1 : freeCount(world, objects, all) / all.length;
  },
  'Animals freed',
);

/** Captive animals still shut in (alive and not free). */
registerMetric(
  'animalsTrapped',
  (world, { objects }) => {
    const alive = objectsOf(world, null, 'captive').filter((o) => objects.alive(o));
    return alive.length - freeCount(world, objects, alive);
  },
  'Animals trapped',
);

/** Captive animals that died. */
registerMetric(
  'animalsLost',
  (world, { objects }) => objectsOf(world, null, 'captive').filter((o) => !objects.alive(o)).length,
  'Animals lost',
);

function freeCount(world: World, objects: ObjectIndex, list: WorldObject[]): number {
  if (list.length === 0) return 0;
  const sky = skyReach(world);
  let n = 0;
  for (const o of list) {
    const i = objects.firstCell(o.id);
    if (i >= 0 && objects.alive(o) && sky[i]) n++;
  }
  return n;
}
