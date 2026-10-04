import type { Blueprint } from '../../core/blueprint';
import { num, registerSetpiece } from '../../core/setpieces';
import { mountainsOf, type MountainRec } from '../mountainStore';
import { carvePocket, elementId, findPocket } from '../setpieceKit';

/**
 * { type: 'captives', count: 3, animal?: 'bird', flock?: 1, invulnerable?: true }
 *
 * Animals sealed in hollows inside the mountains, spread over the biggest mountains (only where
 * nothing nearer covers the rock): `count` hollows of `flock` animals each, so a big flock is a
 * swarm that pours out when its hollow is cut open. Each animal is a creature object of kind
 * `animal` tagged 'captive'; it counts as freed once open air connects it to the sky
 * (gen/metrics/captives.ts). With `invulnerable` they cannot be killed: cut or burnt, they re-form.
 */
registerSetpiece({
  type: 'captives',
  label: 'Captive animals',
  order: 26, // after the trees (20) and the moon (25), so nothing is painted over the hollows
  run: ({ bp, dims, newStroke }, spec) => {
    const animal = typeof spec.animal === 'string' ? spec.animal : 'bird';
    const el = elementId(animal);
    if (el === 0) return;
    const count = Math.max(0, Math.round(num(spec, 'count', 3)));
    const flock = Math.max(1, Math.round(num(spec, 'flock', 1)));
    const scale = dims.h / 256;
    const wall = Math.max(3, Math.round(3 * scale));
    const tags = spec.invulnerable ? ['captive', 'invulnerable'] : ['captive'];
    const hosts = biggest(bp, mountainsOf(bp));
    if (hosts.length === 0) return;

    let placed = 0;
    for (let tries = 0; placed < count && tries < count + hosts.length * 2; tries++) {
      const host = hosts[tries % hosts.length];
      // a hollow sized for the flock: birds in rows (a bird is 5 cells wide, 4 tall), smaller if it does not fit
      let p = null;
      for (let n = flock; n >= 1 && !p; n = Math.floor(n * 0.7)) {
        const { rx, ry } = hollowFor(n, scale);
        p = findPocket(bp, host, rx, ry, wall);
      }
      if (!p) continue;
      carvePocket(bp, p, host.plane);
      const slots = slotsIn(p, flock);
      slots.forEach(([x, y], k) => {
        newStroke({
          kind: animal,
          bbox: [x - 3, y - 2, x + 3, y + 1],
          anchor: [x, y],
          tags,
          group: host.id,
          spawn: { el, face: (k + placed) % 2 === 0 ? 1 : -1 },
        });
      });
      placed++;
    }
  },
});

const COL = 6; // cells between birds side by side
const ROW = 4; // ...and one above the other

/** Half sizes of a hollow that holds n birds (in a grid about twice as wide as tall). */
function hollowFor(n: number, scale: number): { rx: number; ry: number } {
  if (n <= 1) return { rx: Math.max(5, Math.round(6 * scale)), ry: Math.max(4, Math.round(4 * scale)) };
  const cols = Math.ceil(Math.sqrt(n * 2));
  const rows = Math.ceil(n / cols);
  return { rx: Math.round((cols * COL) / 2 + 5), ry: Math.round((rows * ROW) / 2 + 4) };
}

/** Up to n bird spots inside the hollow, a grid of slots whose whole sprite fits in the ellipse. */
function slotsIn(p: { cx: number; cy: number; rx: number; ry: number }, n: number): [number, number][] {
  if (n <= 1) return [[p.cx, p.cy]];
  const inside = (x: number, y: number) => ((x - p.cx) / p.rx) ** 2 + ((y - p.cy) / p.ry) ** 2 <= 1;
  const out: [number, number][] = [];
  for (let y = Math.ceil(p.cy - p.ry + 3); y <= p.cy + p.ry - 2 && out.length < n; y += ROW) {
    for (let x = Math.ceil(p.cx - p.rx + 3); x <= p.cx + p.rx - 3 && out.length < n; x += COL) {
      if (inside(x - 2, y - 2) && inside(x + 2, y - 2) && inside(x - 2, y + 1) && inside(x + 2, y + 1)) out.push([x, y]);
    }
  }
  return out;
}

/** Mountains (not plateaus) still in the registry, biggest first. */
export function biggest(bp: Blueprint, list: readonly MountainRec[]): MountainRec[] {
  const area = (id: number) => {
    const b = bp.registry.strokes.get(id)?.bbox;
    return b ? (b[2] - b[0]) * (b[3] - b[1]) : 0;
  };
  return list.filter((m) => !m.slab && bp.registry.strokes.has(m.id)).sort((a, b) => area(b.id) - area(a.id) || a.id - b.id);
}
