import { rgba } from '../../core/elements';
import { blob, ink, inkStroke } from '../paint/strokes';
import { ownedBox } from './common';
import { registerSpecies } from './registry';

/** A taller tree at a mountain's foot: a tapering paper-white trunk, outlined, under a column of leaf dabs. */
registerSpecies({
  name: 'edgeTree',
  grow: (g) => {
    const { x, y, size, rng, noise } = g;
    const steps = 10;
    const wid = Math.max(g.k, size * 0.06);
    const bend = rng.range(-0.08, 0.08) * size;
    const l1: [number, number][] = [];
    const l2: [number, number][] = [];
    const leaves: [number, number, number][] = [];
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const nx = x + bend * t * t;
      const ny = y - t * size;
      const taper = (steps - i) / steps;
      l1.push([nx + ((noise.n2(i * 0.5, 3) - 0.5) * wid - wid / 2) * taper, ny]);
      l2.push([nx + ((noise.n2(i * 0.5, 4) - 0.5) * wid + wid / 2) * taper, ny]);
      if (i >= steps / 5) {
        for (let b = 0; b < (steps - i) * 1.5; b++) {
          const reach = wid * 3.2 * (Math.log(50 * taper + 1) / 3.95);
          leaves.push([nx + rng.next() * reach * (rng.chance(0.5) ? -1 : 1), ny + (rng.next() - 0.5) * wid * 2, reach]);
        }
      }
    }
    const trunk = l1.concat(l2.slice().reverse());
    g.paint.fillPolygon(trunk, rgba(241, 235, 220), g.owner);
    inkStroke(g.paint, trunk, noise, { wid: g.k * 0.45, color: ink(0.5, g.ink), noi: 0.3, widthFn: () => 1 });
    for (const [lx, ly, reach] of leaves) {
      blob(g.paint, lx, ly, noise, {
        len: Math.max(g.k * 2, Math.abs(lx - x) * 2 + reach * 0.3),
        wid: size * rng.range(0.04, 0.09),
        ang: (rng.next() - 0.5) * (Math.PI / 6),
        color: ink(rng.range(0.3, 0.5), g.ink),
        noi: 0.5,
        owner: g.owner,
        salt: lx * 0.01,
      });
    }
    return ownedBox(g);
  },
});
