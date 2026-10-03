import type { World } from '../../core/world';
import { launchBody, markUnsupported } from '../behaviors/rigid';
import { DEBRIS } from '../elements/debris';
import { registerLineAbility } from '../lineAbility';
import { K_LIQUID, K_POWDER, KIND, RIGID } from '../physics';
import { defineTunables } from '../tunables';

export const pushTunables = defineTunables(
  'push',
  {
    /** Launch speed along the line (cells per tick). */
    speed: 9,
    /** Extra upward kick, so things arc instead of skidding. */
    lift: 2.5,
    /** Rough size of the chunks rock breaks into (cells across). */
    chunk: 6,
    /** How much speed a thrown chunk keeps when it hits rock (it rebounds out of the surface). */
    rebound: 0.75,
  },
  {
    speed: [1, 12, 0.5],
    lift: [0, 6, 0.25],
    chunk: [2, 30, 1],
    rebound: [0, 1, 0.05],
  },
);

const clamp = (v: number) => Math.max(-12, Math.min(12, Math.round(v)));

/**
 * Fling everything under the brush. Loose material (earth, ash, water) flies as DEBRIS and lands
 * back as itself; rock, wood and leaves break into a few chunks that fly as rigid pieces (chunks
 * walled in by solid rock burst into flying rubble instead, which sprays out of the crater).
 Everything is thrown along (ux, uy).
 */
function shove(world: World, cx: number, cy: number, r: number, ux: number, uy: number, speed: number): void {
  const { el, aux, w, rng } = world;
  const lift = pushTunables.lift;

  const solids: number[] = [];
  world.forCircle(cx, cy, r, (x, y) => {
    const i = y * w + x;
    const e = el[i];
    const k = KIND[e];
    if (k === K_POWDER || k === K_LIQUID) {
      const v = speed * rng.range(0.7, 1.2);
      world.set(x, y, DEBRIS, { aux: e, life: aux[i], vx: clamp(ux * v), vy: clamp(uy * v - lift * rng.range(0.5, 1.5)) });
    } else if (RIGID[e]) {
      solids.push(i);
    }
  });

  if (solids.length > 0) {
    // break the solid part into chunks: each cell joins its nearest of a few random seeds
    const size = Math.max(2, pushTunables.chunk);
    const k = Math.max(1, Math.min(24, Math.round(solids.length / (size * size))));
    const seeds: number[] = [];
    for (let s = 0; s < k; s++) seeds.push(solids[rng.int(solids.length)]);
    const groups: number[][] = seeds.map(() => []);
    for (const i of solids) {
      const x = i % w;
      const y = (i / w) | 0;
      let best = 0;
      let bestD = Infinity;
      for (let s = 0; s < k; s++) {
        const dx = (seeds[s] % w) - x;
        const dy = ((seeds[s] / w) | 0) - y;
        const d = dx * dx + dy * dy;
        if (d < bestD) (bestD = d), (best = s);
      }
      groups[best].push(i);
    }
    for (let s = 0; s < k; s++) {
      if (groups[s].length === 0) continue;
      const v = speed * rng.range(0.8, 1.2);
      launchBody(world, groups[s], ux * v + rng.range(-0.5, 0.5), uy * v - lift * rng.range(0.5, 1.5), pushTunables.rebound, true, rng.range(-0.12, 0.12));
    }
  }
  markUnsupported(world);
}

/**
 * Aim a line, release to send a shockwave along it: everything in the strip is flung in the
 * line's direction. Rock breaks into flying chunks (or rubble if walled in); earth and water spray.
 */
registerLineAbility({
  id: 'push',
  name: 'Push',
  icon: '推',
  color: '40, 40, 40',
  apply: (world, ax, ay, bx, by, r, ux, uy, _speed, power) => {
    // hit everything along this stretch, nearest first
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len / Math.max(1, r * 0.6)));
    for (let k = 0; k <= n; k++) shove(world, ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, r, ux, uy, Math.min(12, pushTunables.speed * power));
  },
});