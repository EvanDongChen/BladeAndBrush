import { elements } from '../../core/elements';
import { registerMetric } from '../../core/scan';
import { countComponents } from '../scan';

/**
 * People in the painting: one per tracked person (distinct object ids on PERSON cells), plus
 * connected clumps of untracked PERSON cells (e.g. painted in the sandbox).
 */
registerMetric(
  'people',
  (world) => {
    const person = elements.all().find((e) => e.name === 'person')?.id;
    if (person === undefined) return 0;
    const ids = new Set<number>();
    let loose: Uint8Array | null = null;
    for (let i = 0; i < world.size; i++) {
      if (world.el[i] !== person) continue;
      const o = world.obj[i];
      if (o !== 0) ids.add(o);
      else (loose ??= new Uint8Array(world.size))[i] = 1;
    }
    return ids.size + (loose ? countComponents(world.w, world.h, loose) : 0);
  },
  'People',
);
