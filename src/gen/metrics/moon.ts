import { objectsOf } from '../../core/objects';
import { registerMetric, type Peak } from '../../core/scan';
import type { World } from '../../core/world';
import { countComponents } from '../scan';

/**
 * The moon (setpiece 'moon'): 1 when it is broken (cut into two or more pieces, or half of it
 * gone), 0.5 when it is only chipped, 0 while whole (or if there is no moon).
 */
registerMetric(
  'moonBroken',
  (world, { objects }) => {
    let best = 0;
    for (const m of objectsOf(world, 'moon')) {
      if (m.cells === 0) continue;
      const lost = m.cells - objects.count(m.id);
      if (lost <= 0) continue;
      best = Math.max(best, lost * 2 >= m.cells || pieces(world, m.id, m.bbox) >= 2 ? 1 : 0.5);
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

/** Connected pieces of the object's cells inside its original bbox. */
function pieces(world: World, id: number, bbox: readonly [number, number, number, number]): number {
  const [x0, y0, x1, y1] = bbox;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const mask = new Uint8Array(bw * bh);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (world.obj[y * world.w + x] === id) mask[(y - y0) * bw + (x - x0)] = 1;
  return countComponents(bw, bh, mask);
}
