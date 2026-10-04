import { blob, ink, inkStroke } from '../paint/strokes';
import { ownedBox } from './common';
import { registerSpecies } from './registry';

/** A slim tree (mid slopes): two wobbly trunk lines with leaf dabs that thin out toward the top. */
registerSpecies({
  name: 'slim',
  grow: (g) => {
    const { x, y, size, rng, noise } = g;
    const steps = 10;
    const wid = Math.max(g.k * 0.6, size * rng.range(0.02, 0.06));
    const l1: [number, number][] = [];
    const l2: [number, number][] = [];
    for (let i = 0; i < steps; i++) {
      const ny = y - (i * size) / steps;
      if (i >= steps / 4) {
        for (let b = 0; b < (steps - i) / 4; b++) {
          blob(g.paint, x + (rng.next() - 0.5) * wid * 1.4 * (steps - i), ny + (rng.next() - 0.5) * wid, noise, {
            len: size * (0.1 + 0.035 * (steps - i) * rng.next()),
            wid: size * rng.range(0.05, 0.12),
            ang: (rng.next() - 0.5) * (Math.PI / 6),
            color: ink(rng.range(0.35, 0.55), g.ink),
            noi: 0.5,
            owner: g.owner,
            salt: i * 3 + b,
          });
        }
      }
      l1.push([x + (noise.n2(i * 0.5, 1) - 0.5) * wid - wid / 2, ny]);
      l2.push([x + (noise.n2(i * 0.5, 2) - 0.5) * wid + wid / 2, ny]);
    }
    const trunk = l1.concat(l2.slice().reverse());
    g.paint.fillPolygon(trunk, ink(0.25, g.ink), g.owner);
    for (const l of [l1, l2]) inkStroke(g.paint, l, noise, { wid: g.k * 0.4, color: ink(0.55, g.ink), noi: 0.3, widthFn: () => 1 });
    return ownedBox(g);
  },
});
