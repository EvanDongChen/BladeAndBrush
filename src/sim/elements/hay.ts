import { registerElement, shade } from '../../core/elements';

/**
 * Loose straw. Falls and piles up (steeper than earth, see sim/behaviors/hay.ts), is lighter than
 * water so it floats, and goes up almost instantly: it catches from a single spark and flares
 * out fast. Not terrain, so it does not count toward mountain heights.
 */
export const HAY = 15;

registerElement({
  id: HAY,
  name: 'hay',
  kind: 'powder',
  density: 8,
  flammability: 0.95,
  solidForScan: false,
  color: (c) => shade(214, 178, 94, c.aux),
});
