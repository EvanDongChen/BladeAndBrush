import { registerElement, shade } from '../../core/elements';

/** Distant ridge in the background plane (bp.bg). Not simulated, not scanned, not interactive yet. */
export const FAR_ROCK = 32;

registerElement({
  id: FAR_ROCK,
  name: 'far_rock',
  kind: 'static',
  density: 0,
  flammability: 0,
  solidForScan: false,
  color: (c) => shade(196, 192, 184, c.aux),
});
