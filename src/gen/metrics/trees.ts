import { El } from '../../core/elements';
import { registerMetric } from '../../core/scan';
import { countComponents } from '../scan';

/** Connected components of TREE cells, so burnt trees stop counting. */
registerMetric(
  'trees',
  (world) => {
    const mask = new Uint8Array(world.size);
    for (let i = 0; i < world.size; i++) mask[i] = world.el[i] === El.TREE ? 1 : 0;
    return countComponents(world.w, world.h, mask);
  },
  'Trees',
);
