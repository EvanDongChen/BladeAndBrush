import { registerElement, shade } from '../../core/elements';

/**
 * Timber: what the village huts are built from (setpiece 'village'). Static and flammable, but
 * not a tree (the trees metric does not count it) and not terrain (a hut is never a peak). Burns
 * like wood: see the per-fuel defaults in sim/behaviors/fire.ts.
 */
export const WOOD = 34;

registerElement({
  id: WOOD,
  name: 'wood',
  kind: 'static',
  density: 60,
  flammability: 0.5,
  solidForScan: false,
  color: (c) => shade(122, 88, 58, c.aux),
});
