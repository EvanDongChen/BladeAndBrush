import { registerBehavior } from '../../core/behaviors';
import { El } from '../../core/elements';
import type { World } from '../../core/world';
import { at, BLOCKED, canSink, fall, fallDir, FLAMMABILITY, FREE, K_STATIC, KIND, moveCell, REPLACEABLE, slideDiagonal, windOf } from '../physics';
import { defineTunables } from '../tunables';

export const waterTunables = defineTunables(
  'water',
  {
    /** Max cells a water cell flows sideways per tick. Higher levels out faster. */
    dispersion: 5,
  },
  { dispersion: [1, 12, 1] },
);

/** Wind above the default breeze starts to push water around. */
const BREEZE = 0.35;

/**
 * Fall, else slide diagonally down, else flow sideways. The flow direction is kept in vx so a
 * stream keeps going one way instead of jittering. Sideways flow stops above a gap, so water
 * drops into grooves on its own. A strong wind blows falling drops sideways, drives the surface
 * downwind (water piles up against the far bank) and, in a gale, whips spray off the top.
 */
export function updateWater(world: World, x: number, y: number): void {
  const wind = windOf(world);
  const gust = Math.abs(wind) - BREEZE;
  const down = fallDir(world);
  const wx = wind > 0 ? 1 : -1;
  if (gust > 0) {
    const free = REPLACEABLE[at(world, x, y + down)] === 1;
    // airborne: slant downwind as it falls
    if (free && world.rng.chance(gust * 0.9) && REPLACEABLE[at(world, x + wx, y + down)]) {
      moveCell(world, x, y, x + wx, y + down, FREE);
      return;
    }
    // a gale lifts spray off an open surface
    if (!free && gust > 0.35 && REPLACEABLE[at(world, x, y - down)] && world.rng.chance((gust - 0.35) * 0.25) && REPLACEABLE[at(world, x + wx, y - down)]) {
      moveCell(world, x, y, x + wx, y - down, FREE);
      return;
    }
  }
  if (fall(world, x, y)) return;
  if (down > 0 && throughPlants(world, x, y)) return;
  if (slideDiagonal(world, x, y)) return;

  const i = y * world.w + x;
  let dir = world.vx[i];
  if (dir === 0) dir = world.rng.chance(0.5 + 0.4 * wind) ? 1 : -1; // the wind pushes still water downwind
  if (gust > 0 && dir !== wx && world.rng.chance(Math.min(1, gust * 1.6))) dir = wx; // and drives it in a strong wind

  const reach = waterTunables.dispersion | 0;
  let dist = 0;
  for (let k = 1; k <= reach; k++) {
    const nx = x + dir * k;
    if (!REPLACEABLE[at(world, nx, y)]) break;
    dist = k;
    if (canSink(El.WATER, at(world, nx, y + down)) !== BLOCKED) break; // fall in here next tick
  }
  if (dist === 0) {
    world.vx[i] = -dir; // blocked: try the other way next tick
    return;
  }
  const j = moveCell(world, x, y, x + dir * dist, y, 1);
  world.vx[j] = dir;
}

/** Plants (trees, leaves, flowers, bamboo: static and flammable) do not hold water up. */
const plant = (e: number) => KIND[e] === K_STATIC && FLAMMABILITY[e] > 0;

/**
 * Water resting on a plant trickles through it: it drops to the first free cell under the
 * foliage (within reach), so trees do not catch and hold the water poured over them.
 */
function throughPlants(world: World, x: number, y: number): boolean {
  const { h, w, el } = world;
  if (y + 1 >= h || !plant(el[(y + 1) * w + x])) return false;
  let ny = y + 1;
  while (ny < h && ny - y <= 40 && plant(el[ny * w + x])) ny++;
  if (ny >= h || ny - y > 40 || !REPLACEABLE[el[ny * w + x]]) return false;
  moveCell(world, x, y, x, ny, FREE);
  return true;
}

registerBehavior(El.WATER, updateWater);
