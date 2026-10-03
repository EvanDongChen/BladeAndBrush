import { BEHAVIORS, behaviors, passes, type Pass } from '../core/behaviors';
import { Flag } from '../core/constants';
import { byOrder } from '../core/registry';
import type { World } from '../core/world';

let cachedVersion = -1;
let pre: Pass[] = [];
let post: Pass[] = [];

function sortPasses(): void {
  if (cachedVersion === passes.version) return;
  const all = passes.all().sort(byOrder);
  pre = all.filter((p) => p.phase === 'pre');
  post = all.filter((p) => p.phase === 'post');
  cachedVersion = passes.version;
}

/**
 * One simulation tick: clear UPDATED, run 'pre' passes, run each cell's behavior bottom to top
 * (alternating left-to-right / right-to-left per tick to avoid directional bias), run 'post'
 * passes, advance world.tick. With no behaviors registered the world is static.
 */
export function step(world: World): void {
  const { el, flags, w, h, size } = world;
  // Imported bindings are copied to locals: in some module loaders (e.g. Vitest) every access to
  // an import is a getter call, which dominates a 245k-cell loop.
  const table = BEHAVIORS;
  const UPDATED = Flag.UPDATED;
  const keep = 0xff & ~UPDATED;
  for (let i = 0; i < size; i++) flags[i] &= keep;

  sortPasses();
  for (const p of pre) p.run(world);

  if (behaviors.size > 0) {
    const leftToRight = (world.tick & 1) === 0;
    for (let y = h - 1; y >= 0; y--) {
      const row = y * w;
      for (let k = 0; k < w; k++) {
        const x = leftToRight ? k : w - 1 - k;
        const i = row + x;
        const fn = table[el[i]];
        if (fn !== undefined && (flags[i] & UPDATED) === 0) fn(world, x, y);
      }
    }
  }

  for (const p of post) p.run(world);
  world.tick++;
}
