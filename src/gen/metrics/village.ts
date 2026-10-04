import { hasTag, objectsOf } from '../../core/objects';
import { registerMetric } from '../../core/scan';

/** Raindrops that have landed on the village: its ground, its huts and its people (stats.rain). */
registerMetric(
  'villageRain',
  (world) => {
    let n = 0;
    for (const o of world.objects.values()) if (hasTag(o, 'village')) n += o.stats.rain ?? 0;
    return n;
  },
  'Rain on the village',
);

/** Villagers still alive. */
registerMetric('villagers', (world, { objects }) => objectsOf(world, 'villager').filter((o) => objects.alive(o)).length, 'Villagers');

/** Villagers that have died since they were placed. */
registerMetric(
  'villagersLost',
  (world, { objects }) => objectsOf(world, 'villager').filter((o) => !objects.alive(o)).length,
  'Villagers lost',
);

/** Huts still standing (at least half of their wood left). */
registerMetric(
  'huts',
  (world, { objects }) => objectsOf(world, 'hut').filter((o) => o.cells > 0 && objects.count(o.id) * 2 >= o.cells).length,
  'Huts standing',
);
