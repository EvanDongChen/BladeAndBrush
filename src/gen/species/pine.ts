import { blob, line, ownedBox } from './common';
import { registerSpecies } from './registry';

/** Ridge pine: a thin trunk carrying stacked, drooping needle tiers that narrow upward. */
registerSpecies({
  name: 'pine',
  grow: (g) => {
    const { x, y, size, rng } = g;
    const lean = size * rng.range(-0.12, 0.12);
    line(g, [
      [x, y],
      [x + lean * 0.5, y - size * 0.5],
      [x + lean, y - size],
    ], size * 0.022, 240, 0.2);
    const tiers = 4 + rng.int(4);
    for (let i = 0; i < tiers; i++) {
      const t = (i + 0.5) / tiers;
      const cx = x + lean * (0.25 + 0.75 * t);
      const cy = y - size * (0.3 + 0.68 * t);
      const half = size * 0.3 * (1 - 0.7 * t) * rng.range(0.8, 1.2);
      const droop = size * 0.05;
      line(g, [
        [cx - half, cy + droop],
        [cx, cy],
        [cx + half, cy + droop * rng.range(0.6, 1.4)],
      ], size * 0.028, 225, 0.8);
    }
    blob(g, x + lean, y - size * 0.98, size * 0.05, size * 0.05);
    return ownedBox(g);
  },
});
