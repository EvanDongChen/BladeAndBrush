import { registerPass } from '../../core/behaviors';
import { cloudCapacity, inCloud, type Cloud } from '../../core/clouds';
import { Flag } from '../../core/constants';
import { registerPlacer } from '../../core/objects';
import { registerParam } from '../../core/params';
import type { World } from '../../core/world';
import { CLOUD } from '../elements/cloud';
import { RAIN } from '../elements/rain';
import { REPLACEABLE } from '../physics';
import { defineTunables } from '../tunables';

registerParam({ key: 'wind', label: 'Wind', min: -1, max: 1, step: 0.05, default: 0.3 });
registerParam({ key: 'windY', label: 'Updraft / downdraft', min: -1, max: 1, step: 0.05, default: 0 }); // < 0 blows up

export const cloudTunables = defineTunables(
  'cloud',
  {
    /** Cells per tick a cloud drifts at full wind (the Wind param is -1..1, negative = to the left). */
    speed: 0.15,
    /** Water a cloud takes in from one cell of steam. */
    soak: 70,
    /** Raindrops per tick from a cloud that is full of water (fewer as it dries). */
    rain: 0.6,
    /** Water a raindrop takes out of the cloud. */
    drop: 18,
  },
  { speed: [0, 1, 0.01], soak: [0, 255, 5], rain: [0, 3, 0.05], drop: [1, 120, 1] },
);

/** The cloud (x, y) is inside, if any. */
export function cloudAt(world: World, x: number, y: number): Cloud | undefined {
  for (const c of world.clouds) if (inCloud(c, x, y, world.w)) return c;
  return undefined;
}

/** Steam reached a cloud, or cooled up high: the water goes into that cloud, or a new little puff. */
export function soak(world: World, x: number, y: number, into?: Cloud): void {
  const c = into ?? cloudAt(world, x, y);
  if (c) {
    c.water = Math.min(cloudCapacity(c), c.water + cloudTunables.soak);
    return;
  }
  world.clouds.push({ obj: 0, x, y, hw: 4, hh: 2, water: cloudTunables.soak, puff: true, seed: (x * 31 + y * 17 + world.tick) | 0 });
}

/**
 * Every tick: clouds drift with the wind (wrapping around the scroll), wet ones rain from their
 * underside into whatever free cell is there, and puffs of steam that have rained out are gone.
 * Small puffs that drift into a bigger cloud merge into it.
 */
registerPass({
  name: 'clouds',
  phase: 'post',
  order: 0,
  run: (world) => {
    const list = world.clouds;
    if (list.length === 0) return;
    const { w, h, el, rng } = world;
    const vx = Math.max(-1, Math.min(1, world.params.wind ?? 0)) * cloudTunables.speed;
    let keep = 0;
    for (const c of list) {
      c.x += vx;
      if (c.x - c.hw > w) c.x -= w + 2 * c.hw;
      else if (c.x + c.hw < 0) c.x += w + 2 * c.hw;

      if (c.water > 0) {
        const n = rng.next() * cloudTunables.rain * (c.water / cloudCapacity(c)) * Math.max(1, c.hw / 10);
        for (let k = 0; k < Math.floor(n) + (rng.chance(n % 1) ? 1 : 0); k++) {
          const x = Math.round(c.x + rng.range(-0.8, 0.8) * c.hw);
          const rx = ((x % w) + w) % w;
          const y = Math.round(c.y + c.hh * 0.8);
          if (y < 0 || y >= h || !REPLACEABLE[el[y * w + rx]]) continue;
          world.set(rx, y, RAIN, { aux: rng.int(256), vy: 1 });
          world.flags[y * w + rx] |= Flag.UPDATED;
          c.water = Math.max(0, c.water - cloudTunables.drop);
          if (c.water === 0) break;
        }
      }
      if (c.puff) {
        const big = list.find((o) => o !== c && !o.puff && inCloud(o, c.x, c.y, w));
        if (big) {
          big.water = Math.min(cloudCapacity(big), big.water + c.water);
          continue;
        }
        if (c.water === 0) continue; // rained out
      }
      list[keep++] = c;
    }
    list.length = keep;
  },
});

/** A cloud the generator asks for: centred on (x, y), `variant` cells half-wide and `face` cells half-tall. */
registerPlacer({
  el: CLOUD,
  place: (world, x, y, o) => {
    world.clouds.push({ obj: o.obj, x, y, hw: Math.max(4, o.variant ?? 30), hh: Math.max(2, o.face ?? 6), water: 0, puff: false, seed: o.obj });
    return true;
  },
});
