import { registerBehavior } from '../../core/behaviors';
import { El, ELEMENTS } from '../../core/elements';
import type { World } from '../../core/world';
import { DEBRIS } from '../elements/debris';
import { FREE, moveCell, REPLACEABLE } from '../physics';
import { defineTunables } from '../tunables';

export const debrisTunables = defineTunables(
  'debris',
  {
    /** Gravity adds 1 to vy every this many ticks (higher = floatier arcs). */
    gravityEvery: 2,
    /** Terminal speed (cells per tick). */
    maxSpeed: 12,
  },
  { gravityEvery: [1, 6, 1], maxSpeed: [2, 12, 1] },
);

/** Turn a debris cell back into the element it carries. */
function land(world: World, j: number): void {
  const carried = world.aux[j];
  const ok = carried !== DEBRIS && ELEMENTS[carried] !== undefined;
  world.el[j] = ok ? carried : El.EMPTY;
  world.aux[j] = world.life[j];
  world.life[j] = 0;
  world.vx[j] = 0;
  world.vy[j] = 0;
}

/** Ballistic flight along vx/vy; lands as its carried element on the first thing it hits. */
function updateDebris(world: World, x: number, y: number): void {
  const { w, h, el, vx: VX, vy: VY } = world;
  const i = y * w + x;
  const max = debrisTunables.maxSpeed;
  const g = world.tick % Math.max(1, debrisTunables.gravityEvery | 0) === 0 ? 1 : 0;
  const vx = Math.max(-max, Math.min(max, VX[i]));
  const vy = Math.max(-max, Math.min(max, VY[i] + g));
  const steps = Math.max(1, Math.abs(vx), Math.abs(vy));

  let cx = x;
  let cy = y;
  let hit = vx === 0 && vy === 0;
  for (let s = 1; s <= steps && !hit; s++) {
    const nx = x + Math.round((vx * s) / steps);
    const ny = y + Math.round((vy * s) / steps);
    if (nx === cx && ny === cy) continue;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h || !REPLACEABLE[el[ny * w + nx]]) hit = true;
    else {
      cx = nx;
      cy = ny;
    }
  }

  const j = cx === x && cy === y ? i : moveCell(world, x, y, cx, cy, FREE);
  if (hit) land(world, j);
  else {
    VX[j] = vx;
    VY[j] = vy;
  }
}

registerBehavior(DEBRIS, updateDebris);
