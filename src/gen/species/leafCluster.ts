import { blob, ink } from '../paint/strokes';
import { ownedBox } from './common';
import { registerSpecies } from './registry';

/** A small clump of leaf dabs (on ridges and high slopes): a few soft vertical blobs around a point. */
registerSpecies({
  name: 'leafCluster',
  grow: (g) => {
    const { x, y, size, rng, noise } = g;
    const clu = 2 + rng.int(4);
    const spread = size * 0.25;
    for (let i = 0; i < clu; i++) {
      const gx = (rng.next() + rng.next() + rng.next() - 1.5) * spread;
      const gy = (rng.next() + rng.next() + rng.next() - 1.5) * spread * 0.6;
      blob(g.paint, x + gx, y - size * 0.45 + gy, noise, {
        len: size * rng.range(0.5, 1.2),
        wid: size * rng.range(0.25, 0.55),
        ang: Math.PI / 2,
        color: ink(rng.range(0.45, 0.7), g.ink),
        noi: 0.6,
        point: 0.9,
        owner: g.owner,
        salt: rng.range(0, 50),
      });
    }
    return ownedBox(g);
  },
});
