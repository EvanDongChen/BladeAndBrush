import { num, registerSetpiece } from '../../core/setpieces';
import { mountainsOf } from '../mountainStore';
import { elementId } from '../setpieceKit';

/**
 * { type: 'flock', count: 4, x?: 0.5, circle?: true }
 *
 * Birds over the highest mountain near x (0..1 of the scroll). With `circle` they keep circling it
 * (tag 'circling': each bird turns back toward where it was placed), which marks that peak out.
 */
registerSetpiece({
  type: 'flock',
  label: 'Flock of birds',
  order: 31,
  run: ({ bp, dims, rng, newStroke }, spec) => {
    const bird = elementId('bird');
    if (bird === 0) return;
    const want = num(spec, 'x', 0.5) * dims.w;
    let best: { x: number; y: number } | null = null;
    let score = Infinity;
    for (const m of mountainsOf(bp)) {
      const info = bp.registry.strokes.get(m.id);
      if (!info || m.slab) continue;
      const [ax, ay] = info.anchor;
      const s = ay + Math.abs(ax - want) * 0.5; // high, and near x
      if (s < score) (score = s), (best = { x: ax, y: ay });
    }
    if (!best) return;
    const count = Math.max(0, Math.round(num(spec, 'count', 4)));
    for (let k = 0; k < count; k++) {
      const x = Math.round(best.x + (k - (count - 1) / 2) * 10);
      const y = Math.max(4, Math.round(best.y - 14 - (k % 2) * 6));
      newStroke({ kind: 'bird', bbox: [x - 3, y - 3, x + 3, y + 2], anchor: [x, y], tags: spec.circle ? ['circling'] : [], spawn: { el: bird, variant: rng.int(4), face: k % 2 === 0 ? 1 : -1 } });
    }
  },
});
