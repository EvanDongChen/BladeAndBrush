import { registerPass } from '../../core/behaviors';
import { El } from '../../core/elements';
import { REPLACEABLE } from '../physics';

/**
 * Water sources (springs) emit WATER at their rate, in cells per tick. The frontier reveal adds a
 * source to world.sources once it passes the source's x; fractional rates emit on average.
 */
registerPass({
  name: 'waterSources',
  phase: 'pre',
  order: 0,
  run: (world) => {
    const { rng, w, el } = world;
    for (const s of world.sources) {
      let n = Math.floor(s.rate);
      if (rng.chance(s.rate - n)) n++;
      for (let k = 0; k < n; k++) {
        const x = s.x + rng.int(3) - 1;
        if (world.inBounds(x, s.y) && REPLACEABLE[el[s.y * w + x]]) world.set(x, s.y, El.WATER, { aux: rng.int(256) });
      }
    }
  },
});
