import { registerElement, shade } from '../../core/elements';

/** Short-lived puff kicked up when pieces land hard or rock shatters. Drifts and fades. */
export const DUST = 13;

registerElement({
  id: DUST,
  name: 'dust',
  kind: 'gas',
  density: 0.8,
  flammability: 0,
  solidForScan: false,
  color: (c) => shade(192, 182, 166, c.aux),
});
