import { num, registerSetpiece, type SetpieceSpec } from '../../core/setpieces';
import { mountainsOf } from '../mountainStore';
import { elementId, isReserved, reserveSpan, topOwner } from '../setpieceKit';

const span = (spec: SetpieceSpec): [number, number] => [num(spec, 'x0', 0), num(spec, 'x1', 1)];

/**
 * { type: 'people', count: 3, kind?: 'person', x0?: 0, x1?: 1, tags?: string[], camp?: true }
 *
 * People standing on open flat land (the top of a plateau's ground slab with open sky above it,
 * not a peak, a tree or a boulder) between x0 and x1, spread out evenly. With `camp`, the level
 * gets a plateau of its own there (clear of mountains and scenery) for them to stand on. Each
 * person is a creature object of `kind` (e.g. 'trapper') with the given tags.
 */
registerSetpiece({
  type: 'people',
  label: 'People',
  order: 12, // after the mountains (10), before plateau scenes (15) and trees (20) grow over their spots
  places: (spec) => {
    if (!spec.camp) return [];
    const [x0, x1] = span(spec);
    return [{ x: (x0 + x1) / 2, kind: 'flat', height: 0.4, y: 0.86, halfWidth: (x1 - x0) / 2 + 0.02 }];
  },
  clears: (spec) => {
    if (!spec.camp) return [];
    const [x0, x1] = span(spec);
    return [[x0 - 0.03, x1 + 0.03]];
  },
  run: ({ bp, dims, rng, newStroke }, spec) => {
    const person = elementId('person');
    if (person === 0) return;
    const count = Math.max(0, Math.round(num(spec, 'count', 3)));
    const kind = typeof spec.kind === 'string' ? spec.kind : 'person';
    const tags = Array.isArray(spec.tags) ? spec.tags.filter((t): t is string => typeof t === 'string') : [];
    const x0 = Math.max(4, Math.round(span(spec)[0] * dims.w));
    const x1 = Math.min(dims.w - 5, Math.round(span(spec)[1] * dims.w));
    if (spec.camp) reserveSpan(bp, x0 - 4, x1 + 4);
    const plateaus = new Set(mountainsOf(bp).filter((m) => m.slab).map((m) => m.id));

    // open land: a plateau is the topmost thing here and around, and it is (nearly) level
    const open = (x: number) => {
      if (!spec.camp && isReserved(bp, x)) return false;
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
      if (!spec.camp) reserveSpan(bp, x - 5, x + 5); // keep trees and boulders off their spot
      newStroke({ kind, bbox: [x - 3, y - 7, x + 3, y + 1], anchor: [x, y], tags, spawn: { el: person, variant: rng.int(6) } });
    }
  },
});
