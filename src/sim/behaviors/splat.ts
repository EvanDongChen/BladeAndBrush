import { registerBehavior } from '../../core/behaviors';
import { El } from '../../core/elements';
import type { World } from '../../core/world';
import { at, FREE, K_GAS, K_PROJECTILE, KIND, moveCell, NEIGHBORS8, REPLACEABLE } from '../physics';
import { defineTunables } from '../tunables';

export const splatTunables = defineTunables(
  'splat',
  {
    /** Terminal speed of a flying droplet (cells per tick). */
    maxSpeed: 10,
  },
  { maxSpeed: [2, 12, 1] },
);

/**
 * Flying ink droplet: ballistic flight using its vx/vy (gravity adds 1 to vy per tick). It traces
 * the cells along its path and settles into STAIN on the last free cell before it hits something.
 * Droplets that leave the canvas are gone.
 */
function updateSplat(world: World, x: number, y: number): void {
  const { w, h, el, vx: VX, vy: VY } = world;
  const i = y * w + x;
  const max = splatTunables.maxSpeed;
  const vx = Math.max(-max, Math.min(max, VX[i]));
  const vy = Math.max(-max, Math.min(max, VY[i] + 1));
  const steps = Math.max(1, Math.abs(vx), Math.abs(vy));

  let cx = x;
  let cy = y;
  let hit = false;
  for (let s = 1; s <= steps; s++) {
    const nx = x + Math.round((vx * s) / steps);
    const ny = y + Math.round((vy * s) / steps);
    if (nx === cx && ny === cy) continue;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
      world.set(x, y, El.EMPTY); // flew off the canvas
      return;
    }
    const e = el[ny * w + nx];
    if (REPLACEABLE[e]) {
      cx = nx;
      cy = ny;
    } else if (!passThrough(e)) {
      hit = true;
      break;
    } // smoke, dust, other droplets: fly through, don't stain on them
  }

  const j = cx === x && cy === y ? i : moveCell(world, x, y, cx, cy, FREE);
  if (hit) {
    el[j] = El.STAIN;
    VX[j] = 0;
    VY[j] = 0;
    if (world.events.has('splash')) world.events.emit('splash', { x: cx, y: cy });
  } else {
    VX[j] = vx;
    VY[j] = vy;
  }
}

/** Things a droplet flies through, and that can't hold a stain up: gases and other flying bits. */
function passThrough(e: number): boolean {
  const k = KIND[e];
  return k === K_GAS || k === K_PROJECTILE;
}

/**
 * A stain clings to whatever it landed on. If that is gone (the piece it was on fell, slid or
 * burnt away) and nothing solid touches it any more, it drips: it turns back into a droplet and
 * settles on the next thing below. Stains touching only other stains count as unsupported.
 */
function updateStain(world: World, x: number, y: number): void {
  for (let k = 0; k < 16; k += 2) {
    const e = at(world, x + NEIGHBORS8[k], y + NEIGHBORS8[k + 1]); // out of bounds reads as rock
    if (!REPLACEABLE[e] && !passThrough(e)) return;
  }
  const i = y * world.w + x;
  world.el[i] = El.SPLAT;
  world.vx[i] = 0;
  world.vy[i] = 0;
}

registerBehavior(El.SPLAT, updateSplat);
registerBehavior(El.STAIN, updateStain);
