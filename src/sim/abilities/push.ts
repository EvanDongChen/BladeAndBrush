import { registerAbility, type AbilityArgs, type PointerSample } from '../../core/abilities';
import { El } from '../../core/elements';
import type { World } from '../../core/world';
import { FREE, moveCell } from '../physics';
import { defineTunables } from '../tunables';

export const pushTunables = defineTunables(
  'push',
  {
    /** How far material moves per cell of drag (1 = it follows the pointer). */
    strength: 1,
  },
  { strength: [0.1, 2, 0.05] },
);

/** Brush offsets sorted front-first along a direction, cached per (radius, direction). */
const orderCache = new Map<string, Int16Array>();

function frontFirst(r: number, sx: number, sy: number): Int16Array {
  const key = `${r}|${sx}|${sy}`;
  let out = orderCache.get(key);
  if (out) return out;
  const pts: [number, number][] = [];
  for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (ox * ox + oy * oy <= r * r) pts.push([ox, oy]);
  pts.sort((a, b) => b[0] * sx + b[1] * sy - (a[0] * sx + a[1] * sy) || a[1] - b[1] || a[0] - b[0]);
  out = new Int16Array(pts.flat());
  orderCache.set(key, out);
  return out;
}

/**
 * Bulldoze: the brush sweeps from `a` to `b` one cell at a time, and at each step every cell in
 * it moves one cell along the drag direction if that cell is empty. Cells at the front move
 * first so the ones behind can follow. Nothing is created or destroyed, so element counts are
 * conserved. Works on everything, rock included, so it can sculpt mountains.
 */
function push(world: World, a: PointerSample, b: PointerSample, args: AbilityArgs): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const r = Math.max(1, Math.round(args.radius ?? 4));
  const sx = Math.round(dx / len);
  const sy = Math.round(dy / len);
  const order = frontFirst(r, sx, sy);
  const steps = Math.min(Math.ceil(len * pushTunables.strength), r * 2);
  const { el, w, h } = world;

  for (let k = 0; k < steps; k++) {
    const cx = Math.round(a.x + (dx * k) / steps);
    const cy = Math.round(a.y + (dy * k) / steps);
    for (let o = 0; o < order.length; o += 2) {
      const x = cx + order[o];
      const y = cy + order[o + 1];
      const tx = x + sx;
      const ty = y + sy;
      if (x < 0 || y < 0 || x >= w || y >= h || tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      if (el[y * w + x] === El.EMPTY || el[ty * w + tx] !== El.EMPTY) continue;
      moveCell(world, x, y, tx, ty, FREE);
    }
  }
}

registerAbility({
  id: 'push',
  name: 'Push',
  icon: '推',
  begin: () => {},
  move: (world, from, to, args) => push(world, from, to, args),
  end: () => {},
});
