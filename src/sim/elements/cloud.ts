import { registerElement, rgba } from '../../core/elements';

/**
 * Clouds are particles (core/clouds.ts), not cells: this element is only the id the generator
 * spawns them by (its placer in sim/behaviors/cloud.ts) and what a cell would look like if painted.
 */
export const CLOUD = 21;

registerElement({
  id: CLOUD,
  name: 'cloud',
  kind: 'gas',
  density: 0.1,
  flammability: 0,
  solidForScan: false,
  color: (c) => rgba(244 - (c.aux & 15), 242 - (c.aux & 15), 236 - (c.aux & 15)),
});
