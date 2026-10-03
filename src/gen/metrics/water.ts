import { El } from '../../core/elements';
import { registerMetric } from '../../core/scan';

/** Total WATER cells. */
registerMetric(
  'water',
  (world) => {
    let n = 0;
    for (let i = 0; i < world.size; i++) if (world.el[i] === El.WATER) n++;
    return n;
  },
  'Water cells',
);
