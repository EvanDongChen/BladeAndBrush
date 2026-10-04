import { objectsOf } from '../../core/objects';
import { registerMetric, type Peak } from '../../core/scan';
import type { World } from '../../core/world';
import { countComponents } from '../scan';

/**
 * The moon (setpiece 'moon'): 1 when it is broken (cut into two or more pieces, or half of it
 * gone), 0.5 when it is only chipped, 0 while whole (or if there is no moon). The pieces are
 * counted wherever they are, so it stays broken after they have fallen out of the moon's old box.
 */
registerMetric(
  'moonBroken',
  (world, { objects }) => {
    let best = 0;
    for (const m of objectsOf(world, 'moon')) {
      if (m.cells === 0) continue;
      const lost = m.cells - objects.count(m.id);
      if (lost <= 0) continue;
      best = Math.max(best, lost * 2 >= m.cells || pieces(world, m.id, m.bbox[1]) >= 2 ? 1 : 0.5);
    }
    return best;
  },
  'Moon broken',
);

/** Tall peaks left of the moon's center, and right of it. */
registerMetric('tallLeftOfMoon', (world, ctx) => tallBeside(world, ctx.peaks, ctx.thresholds.tallFrac, -1), 'Tall peaks left of the moon');
registerMetric('tallRightOfMoon', (world, ctx) => tallBeside(world, ctx.peaks, ctx.thresholds.tallFrac, 1), 'Tall peaks right of the moon');

function tallBeside(world: World, peaks: Peak[], tallFrac: number, side: number): number {
  const moon = objectsOf(world, 'moon')[0];
  if (!moon) return 0;
  return peaks.filter((p) => p.h >= tallFrac * world.h && Math.sign(p.x - moon.x) === side).length;
}

/** Connected pieces of the object's cells, from the top of its original box down to the bottom of the canvas. */
function pieces(world: World, id: number, top: number): number {
  const bw = world.w;
  const bh = world.h - top;
  const mask = new Uint8Array(bw * bh);
  for (let y = top; y < world.h; y++) for (let x = 0; x < bw; x++) if (world.obj[y * world.w + x] === id) mask[(y - top) * bw + x] = 1;
  return countComponents(bw, bh, mask);
}
