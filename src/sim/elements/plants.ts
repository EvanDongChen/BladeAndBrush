import { registerPlacer } from '../../core/objects';
import type { World } from '../../core/world';
import { markUnsupported } from '../behaviors/rigid';
import { REPLACEABLE } from '../physics';
import { BAMBOO, BAMBOO_JOINT } from './bamboo';
import { FLOWER } from './flower';
import { LEAF } from './leaf';

/**
 * Placers for plants the generator scatters over the painting (gen/features/life.ts): it asks for
 * "a flower here" or "bamboo here" by element, and these grow them as ordinary cells carrying the
 * plant's object id. They only grow into free cells.
 */

const free = (world: World, x: number, y: number) => world.inBounds(x, y) && REPLACEABLE[world.el[y * world.w + x]] === 1;

/** A small flower with its stem foot at (x, y); variant = petal color. */
registerPlacer({
  el: FLOWER,
  place: (world, x, y, o) => {
    const hue = o.variant ?? world.rng.int(4);
    const cells: readonly [number, number, number][] = [
      [0, -4, 1],
      [0, -5, 0],
      [-1, -4, 0],
      [1, -4, 0],
      [0, -3, 0],
      [0, -2, 2],
      [0, -1, 2],
    ];
    for (const [dx, dy] of cells) if (!free(world, x + dx, y + dy)) return false;
    for (const [dx, dy, part] of cells) world.set(x + dx, y + dy, FLOWER, { aux: (hue << 2) | part, obj: o.obj });
    markUnsupported(world);
    return true;
  },
});

/**
 * A bamboo stalk standing on (x, y) (its foot), two cells wide, `variant` cells tall, with a joint
 * every 7 rows, a few leaf sprays and a crown of leaves.
 */
registerPlacer({
  el: BAMBOO,
  place: (world, x, y, o) => {
    const height = Math.max(8, o.variant ?? 30);
    for (let k = 0; k < height; k++) if (!free(world, x, y - 1 - k) || !free(world, x + 1, y - 1 - k)) return false;
    const { rng } = world;
    for (let k = 0; k < height; k++) {
      const aux = k % 7 === 6 ? rng.int(BAMBOO_JOINT) : BAMBOO_JOINT + rng.int(256 - BAMBOO_JOINT);
      world.set(x, y - 1 - k, BAMBOO, { aux, obj: o.obj });
      world.set(x + 1, y - 1 - k, BAMBOO, { aux: Math.min(255, aux + 12), obj: o.obj });
    }
    const top = y - height;
    const leaf = (lx: number, ly: number) => {
      if (free(world, lx, ly)) world.set(lx, ly, LEAF, { aux: rng.int(256), obj: o.obj });
    };
    // leaf sprays grow straight out of the stalk (joined to it, so they hold on), tipped up at the end
    for (let ly = top + 10; ly < y - 12; ly += 12) {
      for (let k = 0; k < 3; k++) leaf(x - 1 - k, ly);
      leaf(x - 3, ly - 1);
      for (let k = 0; k < 3; k++) leaf(x + 2 + k, ly - 4);
      leaf(x + 4, ly - 5);
    }
    world.forCircle(x, top, 2.5, (cx, cy) => leaf(cx, cy));
    markUnsupported(world);
    return true;
  },
});
