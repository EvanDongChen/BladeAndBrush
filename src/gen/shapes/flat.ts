import { hashSeed, Rng } from '../../core/rng';
import { mountainProfile } from './profile';
import { registerShape } from './registry';

/** A plateau: a peak whose top is compressed flat above a seed-chosen fraction of its height. */
registerShape({
  name: 'flat',
  build: (p, ctx) => {
    const cap = new Rng(hashSeed(p.seed, 'flat')).range(0.5, 0.65);
    return mountainProfile(p, ctx, { shapeH: (h, H) => (h > cap * H ? cap * H + (h - cap * H) * 0.1 : h) });
  },
});
