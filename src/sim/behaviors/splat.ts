import { registerBehavior } from '../../core/behaviors';
import { El } from '../../core/elements';
import type { World } from '../../core/world';
import { FREE, moveCell, REPLACEABLE } from '../physics';
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
    if (!REPLACEABLE[el[ny * w + nx]]) {
      hit = true;
      break;
    }
    cx = nx;
    cy = ny;
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

registerBehavior(El.SPLAT, updateSplat);
