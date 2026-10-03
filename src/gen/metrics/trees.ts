import { El } from '../../core/elements';
import { registerMetric } from '../../core/scan';
import { countComponents } from '../scan';

/**
 * One per tree: distinct owner ids among TREE cells, so touching trees in a clump count
 * separately, a slashed tree still counts once, and a fully burnt tree stops counting.
 * TREE cells with no owner (e.g. painted in the sandbox) fall back to connected components.
 */
registerMetric(
  'trees',
  (world) => {
    const owners = new Set<number>();
    let unowned: Uint8Array | null = null;
    for (let i = 0; i < world.size; i++) {
      if (world.el[i] !== El.TREE) continue;
      const o = world.owner[i];
      if (o !== 0) owners.add(o);
      else (unowned ??= new Uint8Array(world.size))[i] = 1;
    }
    return owners.size + (unowned ? countComponents(world.w, world.h, unowned) : 0);
  },
  'Trees',
);
