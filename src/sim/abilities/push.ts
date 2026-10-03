import { registerAbility, type AbilityArgs, type PointerSample } from '../../core/abilities';
import type { World } from '../../core/world';
import { launchBody, markUnsupported } from '../behaviors/rigid';
import { DEBRIS } from '../elements/debris';
import { K_LIQUID, K_POWDER, KIND, RIGID } from '../physics';
import { defineTunables } from '../tunables';

export const pushTunables = defineTunables(
  'push',
  {
    /** Launch speed per unit of pointer speed (cells per tick). */
    power: 0.6,
    /** Slowest launch, even for a slow drag. */
    minSpeed: 3,
    /** Fastest launch. */
    maxSpeed: 11,
    /** Extra upward kick, so things arc instead of skidding. */
    lift: 2.5,
    /** Launch speed of a click without dragging (a blast outward in every direction). */
    blast: 11,
    /** Rough size of the chunks rock breaks into (cells across). */
    chunk: 6,
    /** How much speed a thrown chunk keeps when it hits rock (it rebounds out of the surface). */
    rebound: 0.75,
  },
  {
    power: [0, 2, 0.05],
    minSpeed: [0, 12, 0.5],
    maxSpeed: [1, 12, 0.5],
    lift: [0, 6, 0.25],
    blast: [0, 12, 0.5],
    chunk: [2, 30, 1],
    rebound: [0, 1, 0.05],
  },
);

const clamp = (v: number) => Math.max(-12, Math.min(12, Math.round(v)));

/**
 * Fling everything under the brush. Loose material (earth, ash, water) flies as DEBRIS and lands
 * back as itself; rock, wood and leaves break into a few chunks that fly as rigid pieces (chunks
 * walled in by solid rock burst into flying rubble instead, which sprays out of the crater).
 * Directional (dirx, diry) for a drag, or outward from the center for a blast.
 */
function shove(world: World, cx: number, cy: number, r: number, dirx: number, diry: number, speed: number, radial: boolean): void {
  const { el, aux, w, rng } = world;
  const lift = pushTunables.lift;
  const away = (x: number, y: number): [number, number] => {
    if (!radial) return [dirx, diry];
    const d = Math.hypot(x - cx, y - cy);
    if (d < 0.5) {
      const a = rng.range(0, Math.PI * 2);
      return [Math.cos(a), Math.sin(a)];
    }
    return [(x - cx) / d, (y - cy) / d];
  };

  const solids: number[] = [];
  world.forCircle(cx, cy, r, (x, y) => {
    const i = y * w + x;
    const e = el[i];
    const k = KIND[e];
    if (k === K_POWDER || k === K_LIQUID) {
      const [ux, uy] = away(x, y);
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
      const [ux, uy] = away(seeds[s] % w, (seeds[s] / w) | 0);
      const v = speed * rng.range(0.8, 1.2);
      launchBody(world, groups[s], ux * v + rng.range(-0.5, 0.5), uy * v - lift * rng.range(0.5, 1.5), pushTunables.rebound, true);
    }
  }
  markUnsupported(world);
}

let start: PointerSample | null = null;
let moved = false;

const radius = (args: AbilityArgs) => Math.max(1, args.radius ?? 4);

/** Drag to fling things along the drag (faster swipe, farther throw). Click to blast outward. */
registerAbility({
  id: 'push',
  name: 'Push',
  icon: '推',
  begin: (_world, s) => {
    start = s;
    moved = false;
  },
  move: (world, from, to, args) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    moved = true;
    const { power, minSpeed, maxSpeed } = pushTunables;
    const speed = Math.max(minSpeed, Math.min(maxSpeed, to.speed * power));
    // a fast swipe moves many cells per tick: hit everything along the way, nearest first
    const r = radius(args);
    const n = Math.max(1, Math.ceil(len / Math.max(1, r * 0.6)));
    for (let k = 1; k <= n; k++) {
      shove(world, from.x + (dx * k) / n, from.y + (dy * k) / n, r, dx / len, dy / len, speed, false);
    }
  },
  end: (world, args) => {
    if (start && !moved) shove(world, start.x, start.y, radius(args), 0, 0, pushTunables.blast, true);
    start = null;
  },
});
