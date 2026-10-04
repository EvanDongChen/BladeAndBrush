import { registerBehavior } from '../../core/behaviors';
import { Flag, NO_PLANE } from '../../core/constants';
import { El } from '../../core/elements';
import type { World } from '../../core/world';
import { CLOUD } from '../elements/cloud';
import { RAIN } from '../elements/rain';
import { REPLACEABLE } from '../physics';
import { defineTunables } from '../tunables';

export const cloudTunables = defineTunables(
  'cloud',
  {
    /** Water a cloud cell takes in from one cell of steam (or a raindrop, or water landing on it). */
    soak: 70,
    /** Chance per tick that a soaked cloud cell lets a raindrop fall (scaled by how wet it is). */
    rain: 0.05,
    /** Water a raindrop takes out of the cloud. */
    drop: 18,
  },
  { soak: [0, 255, 5], rain: [0, 0.5, 0.005], drop: [1, 120, 1] },
);

/**
 * A drop of water or rain resting on top of a cloud falls through it: it moves to the first free
 * cell under the cloud (within reach). Returns true if it went through. Clouds are only soaked by
 * steam, so pouring water on one does not make it rain.
 */
export function dropThroughCloud(world: World, x: number, y: number): boolean {
  const { w, h, el } = world;
  let ny = y + 1;
  while (ny < h && ny - y <= 40 && el[ny * w + x] === CLOUD) ny++;
  if (ny === y + 1 || ny >= h || ny - y > 40 || !REPLACEABLE[el[ny * w + x]]) return false;
  const i = y * w + x;
  const e = el[i];
  const aux = world.aux[i];
  world.set(x, y, El.EMPTY);
  world.set(x, ny, e, { aux, vy: 1 });
  world.flags[ny * w + x] |= Flag.UPDATED;
  return true;
}

/** Add water to the cloud cell at index i. A wet cell shows its own grey, not the painted cloud. */
export function soak(world: World, i: number, amount: number): void {
  world.life[i] = Math.min(255, world.life[i] + amount);
  world.plane[i] = NO_PLANE;
}

/**
 * A wet cloud cell shares its water with a drier cloud neighbour (so a soaked patch spreads through
 * the cloud), and now and then lets a raindrop fall from its underside. A cloud made of cooled
 * steam is gone once it is dry.
 */
function updateCloud(world: World, x: number, y: number): void {
  const { w, h, el, life, rng } = world;
  const i = y * w + x;
  const water = life[i];
  if (water === 0) return; // dry: nothing to do (most of the time)

  // share with a random neighbour
  const k = rng.int(4);
  const n = k === 0 ? i - 1 : k === 1 ? i + 1 : k === 2 ? i - w : i + w;
  const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
  if (nx >= 0 && nx < w && n >= 0 && n < world.size && el[n] === CLOUD && life[n] + 8 < water) {
    const give = (water - life[n]) >> 2;
    life[i] -= give;
    soak(world, n, give);
  }

  // rain from the underside
  if (y + 1 < h && REPLACEABLE[el[i + w]] && rng.chance(cloudTunables.rain * (life[i] / 255))) {
    world.set(x, y + 1, RAIN, { aux: rng.int(256) });
    world.flags[i + w] |= Flag.UPDATED;
    life[i] = Math.max(0, life[i] - cloudTunables.drop);
  }

  if (life[i] === 0 && world.vx[i] === 1) world.set(x, y, El.EMPTY); // a puff of steam, rained out
}

registerBehavior(CLOUD, updateCloud);
