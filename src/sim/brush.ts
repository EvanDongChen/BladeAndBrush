import type { World } from '../core/world';

export type CapsuleFn = (x: number, y: number, ox: number, oy: number, d: number) => void;

/**
 * Visit every in-bounds cell within `r` of the segment (ax, ay)-(bx, by). `ox, oy` is the cell's
 * offset from the nearest point on the segment and `d` its length, so callers can shape the
 * brush (jagged edges) or push things away from the stroke (splatter normals).
 */
export function forCapsule(world: World, ax: number, ay: number, bx: number, by: number, r: number, fn: CapsuleFn): void {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r));
  const x1 = Math.min(world.w - 1, Math.ceil(Math.max(ax, bx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r));
  const y1 = Math.min(world.h - 1, Math.ceil(Math.max(ay, by) + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let t = len2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ox = x - (ax + t * dx);
      const oy = y - (ay + t * dy);
      const d2 = ox * ox + oy * oy;
      if (d2 <= r2) fn(x, y, ox, oy, Math.sqrt(d2));
    }
  }
}
