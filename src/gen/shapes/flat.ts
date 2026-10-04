import { hashSeed, Rng } from '../../core/rng';
import { layeredMountain } from './layered';
import { registerShape } from './registry';

/** A flat-topped mountain (plateau): fewer layers, a wide twin hump cut flat on top. */
registerShape({
  name: 'flat',
  build: (p, ctx) => layeredMountain(p, ctx, { layers: 5, chop: new Rng(hashSeed(p.seed, 'flat')).range(0.22, 0.34) }),
});
