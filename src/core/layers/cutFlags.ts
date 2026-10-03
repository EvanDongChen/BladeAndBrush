import { Flag } from '../constants';
import { registerLayer } from '../render';

/** Debug: tint every CUT cell (slash scars) red. */
registerLayer({
  name: 'cutFlags',
  label: 'CUT flags',
  order: 15,
  kind: 'pixels',
  debug: true,
  draw: ({ pixels, world }) => {
    const { flags, size } = world;
    for (let i = 0; i < size; i++) if (flags[i] & Flag.CUT) pixels[i] = 0xff3030e0;
  },
});
