import { blob, line, ownedBox } from './common';
import { registerSpecies } from './registry';

/** Slope tree: a short trunk under a rounded crown of overlapping foliage blobs. */
registerSpecies({
  name: 'round',
  grow: (g) => {
    const { x, y, size, rng } = g;
    const lean = size * rng.range(-0.1, 0.1);
    line(g, [
      [x, y],
      [x + lean, y - size * 0.55],
    ], size * 0.025, 235, 0.25);
    const cx = x + lean;
    const cy = y - size * 0.68;
    const n = 3 + rng.int(3);
    for (let i = 0; i < n; i++) {
      const rx = size * rng.range(0.16, 0.26);
      blob(g, cx + size * rng.range(-0.18, 0.18), cy + size * rng.range(-0.14, 0.12), rx, rx * rng.range(0.65, 0.85));
    }
    return ownedBox(g);
  },
});
