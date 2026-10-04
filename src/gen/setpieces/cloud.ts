import { num, registerSetpiece } from '../../core/setpieces';
import { paintCloud } from '../paint/cloud';

/**
 * { type: 'cloud', x: 0.5, y: 0.25, w: 0.12, h: 0.035 }
 *
 * A cloud the level wants in a particular spot (fractions of the scroll; w and h are half sizes),
 * e.g. over a village that needs rain. One object of kind 'cloud'.
 */
registerSetpiece({
  type: 'cloud',
  label: 'Cloud',
  order: 23,
  run: ({ bp, dims, rng, noise, newStroke }, spec) => {
    paintCloud(bp, newStroke, rng, noise, num(spec, 'x', 0.5) * dims.w, num(spec, 'y', 0.25) * dims.h, num(spec, 'w', 0.08) * dims.w, num(spec, 'h', 0.035) * dims.h);
  },
});
