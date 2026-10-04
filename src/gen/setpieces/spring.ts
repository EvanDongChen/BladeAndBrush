import { num, registerSetpiece } from '../../core/setpieces';
import { mountainsOf } from '../mountainStore';
import { carvePocket, findPocket } from '../setpieceKit';
import { biggest } from './captives';

/**
 * { type: 'spring', rate: 0.5, x?: 0.3 }
 *
 * A spring sealed inside a mountain: a hollow with a water source at its top (rate in cells per
 * tick). It fills its hollow and stops; cut it open and it keeps flowing. Uses the mountain
 * nearest x (0..1 of the scroll), or the biggest one. One object of kind 'spring'.
 */
registerSetpiece({
  type: 'spring',
  label: 'Hidden spring',
  order: 27,
  run: ({ bp, dims, newStroke }, spec) => {
    const scale = dims.h / 256;
    const rx = Math.max(5, Math.round(7 * scale));
    const ry = Math.max(4, Math.round(5 * scale));
    const wall = Math.max(3, Math.round(3 * scale));
    const want = typeof spec.x === 'number' ? spec.x * dims.w : undefined;
    const anchorX = (id: number) => bp.registry.strokes.get(id)?.anchor[0] ?? 0;
    const hosts = biggest(bp, mountainsOf(bp));
    if (want !== undefined) hosts.sort((a, b) => Math.abs(anchorX(a.id) - want) - Math.abs(anchorX(b.id) - want) || a.id - b.id);
    for (const host of hosts) {
      const p = findPocket(bp, host, rx, ry, wall, want);
      if (!p) continue;
      carvePocket(bp, p, host.plane);
      const sy = Math.round(p.cy - p.ry + 1);
      bp.registry.waterSources.push({ x: p.cx, y: sy, rate: num(spec, 'rate', 0.5) });
      newStroke({ kind: 'spring', bbox: [p.cx - p.rx, p.cy - p.ry, p.cx + p.rx, p.cy + p.ry], anchor: [p.cx, sy], tags: ['spring'], group: host.id });
      return;
    }
  },
});
