import type { Blueprint } from '../../core/blueprint';
import { num, registerSetpiece } from '../../core/setpieces';
import { mountainsOf, type MountainRec } from '../mountainStore';
import { carvePocket, elementId, findPocket } from '../setpieceKit';

/**
 * { type: 'captives', count: 3, animal?: 'bird', invulnerable?: true }
 *
 * Animals sealed in hollows inside the mountains, one per hollow, spread over the biggest
 * mountains (only where nothing nearer covers the rock). Each is a creature object of kind
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
    const scale = dims.h / 256;
    const rx = Math.max(5, Math.round(6 * scale));
    const ry = Math.max(4, Math.round(4 * scale));
    const wall = Math.max(3, Math.round(3 * scale));
    const hosts = biggest(bp, mountainsOf(bp));
    if (hosts.length === 0) return;

    let placed = 0;
    for (let tries = 0; placed < count && tries < count + hosts.length * 2; tries++) {
      const host = hosts[tries % hosts.length];
      const p = findPocket(bp, host, rx, ry, wall);
      if (!p) continue;
      carvePocket(bp, p, host.plane);
      newStroke({
        kind: animal,
        bbox: [p.cx - p.rx, p.cy - p.ry, p.cx + p.rx, p.cy + p.ry],
        anchor: [p.cx, p.cy],
        tags: spec.invulnerable ? ['captive', 'invulnerable'] : ['captive'],
        group: host.id,
        spawn: { el, face: placed % 2 === 0 ? 1 : -1 },
      });
      placed++;
    }
  },
});

/** Mountains (not plateaus) still in the registry, biggest first. */
export function biggest(bp: Blueprint, list: readonly MountainRec[]): MountainRec[] {
  const area = (id: number) => {
    const b = bp.registry.strokes.get(id)?.bbox;
    return b ? (b[2] - b[0]) * (b[3] - b[1]) : 0;
  };
  return list.filter((m) => !m.slab && bp.registry.strokes.has(m.id)).sort((a, b) => area(b.id) - area(a.id) || a.id - b.id);
}
