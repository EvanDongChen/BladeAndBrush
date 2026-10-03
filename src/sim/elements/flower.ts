import { registerElement, rgba } from '../../core/elements';
import { markUnsupported } from '../behaviors/rigid';
import { registerSpawner } from '../spawn';

/** A tiny painted flower: four petals, a center, and a short stem. */
export const FLOWER = 19;

const PETAL = 0;
const CENTER = 1;
const STEM = 2;

const PETALS = [
  [232, 112, 132],
  [242, 170, 72],
  [174, 126, 218],
  [238, 224, 104],
] as const;

registerElement({
  id: FLOWER,
  name: 'flower',
  kind: 'static',
  density: 30,
  flammability: 0.9,
  solidForScan: true,
  color: (c) => {
    if ((c.aux & 3) === STEM) return rgba(64, 116, 58);
    if ((c.aux & 3) === CENTER) return rgba(246, 210, 74);
    const [r, g, b] = PETALS[(c.aux >> 2) % PETALS.length];
    return rgba(r, g, b);
  },
});

/** Stamp a small flower rather than filling the brush radius. */
registerSpawner(
  FLOWER,
  (world, x, y) => {
    const hue = world.rng.int(PETALS.length);
    const cells: readonly [number, number, number][] = [
      [0, 0, CENTER],
      [0, -1, PETAL],
      [-1, 0, PETAL],
      [1, 0, PETAL],
      [0, 1, PETAL],
      [0, 2, STEM],
      [0, 3, STEM],
    ];

    for (const [dx, dy, part] of cells) {
      const px = Math.round(x) + dx;
      const py = Math.round(y) + dy;
      if (world.inBounds(px, py)) world.set(px, py, FLOWER, { aux: (hue << 2) | part });
    }
    markUnsupported(world);
  },
  8,
);
