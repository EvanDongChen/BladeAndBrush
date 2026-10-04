import { El } from '../../core/elements';
import { registerMetric } from '../../core/scan';
import { countComponents } from '../scan';

/** A tracked tree burnt or cut down below this fraction of its wood is gone. */
const STANDING = 0.25;

/**
 * One per tree: distinct owner ids among TREE cells, so touching trees in a clump count
 * separately and a slashed tree still counts once. A tracked tree (core/objects.ts) stops counting
 * once less than a quarter of its wood is left, so a charred stump is not a tree. TREE cells with
 * no owner (e.g. painted in the sandbox) fall back to connected components.
 */
registerMetric(
  'trees',
  (world) => {
    const cells = new Map<number, number>();
    let unowned: Uint8Array | null = null;
    for (let i = 0; i < world.size; i++) {
      if (world.el[i] !== El.TREE) continue;
      const o = world.owner[i];
      if (o !== 0) cells.set(o, (cells.get(o) ?? 0) + 1);
      else (unowned ??= new Uint8Array(world.size))[i] = 1;
    }
    let n = 0;
    for (const [id, left] of cells) {
      const total = world.objects.get(id)?.cells ?? 0;
      if (left >= STANDING * total) n++;
    }
    return n + (unowned ? countComponents(world.w, world.h, unowned) : 0);
  },
  'Trees',
);
