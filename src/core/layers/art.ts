import { registerLayer } from '../render';

/** Hybrid art layer hook (section 3.8). The compositor lands in the next commit; draws nothing yet. */
registerLayer({
  name: 'art',
  order: 20,
  kind: 'canvas',
  flag: 'artLayer',
  draw: () => {},
});
