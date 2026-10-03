import { registerElement, shade } from '../../core/elements';

/**
 * Tree canopy. Static like the trunk (TREE, the wood), but catches fire much more easily and
 * burns out fast, mostly into smoke.
 */
export const LEAF = 11;

registerElement({
  id: LEAF,
  name: 'leaf',
  kind: 'static',
  density: 20,
  flammability: 0.9,
  solidForScan: true,
  color: (c) => shade(74, 108, 62, c.aux),
});
