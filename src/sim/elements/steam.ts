import { registerElement, shade } from '../../core/elements';

/** Made when water meets fire. Rises fast, and some of it condenses back into water. */
export const STEAM = 10;

registerElement({
  id: STEAM,
  name: 'steam',
  kind: 'gas',
  density: 0.3,
  flammability: 0,
  solidForScan: false,
  color: (c) => shade(198, 206, 212, c.aux),
});
