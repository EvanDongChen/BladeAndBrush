import { registerElement, shade } from '../../core/elements';

/** Loose soil: falls and piles like sand, sinks through water, does not burn. Counts as terrain. */
export const EARTH = 9;

registerElement({
  id: EARTH,
  name: 'earth',
  kind: 'powder',
  density: 50,
  flammability: 0,
  solidForScan: true,
  color: (c) => shade(108, 90, 68, c.aux),
});
