import { num, registerSetpiece } from '../../core/setpieces';
import { mountainsOf } from '../mountainStore';
import { elementId, isReserved, topOwner } from '../setpieceKit';

/**
 * { type: 'people', count: 3, kind?: 'person', x0?: 0, x1?: 1, tags?: string[] }
 *
 * People standing on open flat land (the top of a plateau's ground slab, not a peak, a tree or a
 * boulder) between x0 and x1, spread out evenly. Each is a creature object of `kind` (e.g.
 * 'trapper') with the given tags.
 */
registerSetpiece({
  type: 'people',
  label: 'People',
  order: 28,
  run: ({ bp, dims, rng, newStroke }, spec) => {
    const person = elementId('person');
    if (person === 0) return;
    const count = Math.max(0, Math.round(num(spec, 'count', 3)));
    const kind = typeof spec.kind === 'string' ? spec.kind : 'person';
    const tags = Array.isArray(spec.tags) ? spec.tags.filter((t): t is string => typeof t === 'string') : [];
    const x0 = Math.max(4, Math.round(num(spec, 'x0', 0) * dims.w));
    const x1 = Math.min(dims.w - 5, Math.round(num(spec, 'x1', 1) * dims.w));
    const plateaus = new Set(mountainsOf(bp).filter((m) => m.slab).map((m) => m.id));

    // open land: a plateau is the topmost thing here and around, and it is (nearly) level
    const open = (x: number) => {
      if (isReserved(bp, x)) return false;
      const here = topOwner(bp, x);
      if (!plateaus.has(here.owner)) return false;
      for (let dx = -3; dx <= 3; dx++) {
        const t = topOwner(bp, x + dx);
        if (t.owner !== here.owner || Math.abs(t.y - here.y) > 2) return false;
      }
      return true;
    };
    const free: number[] = [];
    for (let x = x0; x <= x1; x++) if (open(x)) free.push(x);
    if (free.length === 0) return;
    for (let k = 0; k < count; k++) {
      const x = free[Math.min(free.length - 1, Math.floor(((k + rng.range(0.3, 0.7)) * free.length) / count))];
      const y = topOwner(bp, x).y - 2;
      newStroke({ kind, bbox: [x - 3, y - 7, x + 3, y + 1], anchor: [x, y], tags, spawn: { el: person, variant: rng.int(6) } });
    }
  },
});
