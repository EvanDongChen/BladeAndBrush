import { num, registerSetpiece } from '../../core/setpieces';

/**
 * { type: 'mountain', x: 0.5, height?: 1, kind?: 'peak' | 'flat', y?: 0.9, halfWidth?: 0.08 }
 *
 * A mountain the level insists on, at x (0..1 of the scroll). `height` is 0..1 on the planner's
 * own scale (up to 1.5 to tower over the rest), so the Mountain height slider still raises and
 * lowers it. `y` is its foot (0..1 of the scroll height, farther = higher up the page). The free
 * mountains are planned around it (gen/plan.ts).
 */
registerSetpiece({
  type: 'mountain',
  label: 'Mountain',
  places: (spec) => [
    {
      x: num(spec, 'x', 0.5),
      height: num(spec, 'height', 1),
      kind: spec.kind === 'flat' ? 'flat' : 'peak',
      y: typeof spec.y === 'number' ? spec.y : undefined,
      halfWidth: typeof spec.halfWidth === 'number' ? spec.halfWidth : undefined,
    },
  ],
});
