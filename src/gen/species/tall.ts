import { blob, line, ownedBox } from './common';
import { registerSpecies } from './registry';

/** Foot tree: a tall leaning trunk with a few branches, foliage clusters at their ends and top. */
registerSpecies({
  name: 'tall',
  grow: (g) => {
    const { x, y, size, rng } = g;
    const lean = size * rng.range(-0.22, 0.22);
    const at = (t: number): [number, number] => [x + lean * t * t, y - size * 0.9 * t];
    const trunk: [number, number][] = [];
    for (let t = 0; t <= 1.0001; t += 0.25) trunk.push(at(t));
    line(g, trunk, size * 0.06, 240, 0.3);
    const branches = 2 + rng.int(3);
    for (let i = 0; i < branches; i++) {
      const t = rng.range(0.45, 0.85);
      const [bx, by] = at(t);
      const dir = i % 2 === 0 ? -1 : 1;
      const ex = bx + dir * size * rng.range(0.18, 0.3);
      const ey = by - size * rng.range(0.05, 0.15);
      line(g, [
        [bx, by],
        [(bx + ex) / 2, (by + ey) / 2 - size * 0.03],
        [ex, ey],
      ], size * 0.03, 230, 0.6);
      blob(g, ex, ey - size * 0.03, size * rng.range(0.1, 0.15), size * rng.range(0.07, 0.1));
    }
    const [tx, ty] = at(1);
    blob(g, tx, ty, size * rng.range(0.14, 0.2), size * rng.range(0.09, 0.12));
    return ownedBox(g);
  },
});
