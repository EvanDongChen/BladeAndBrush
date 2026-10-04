import { El, ELEMENTS, type CellView } from '../elements';
import { registerLayer } from '../render';
import { resolveShaders, SHADED } from '../shaders';

const view: CellView = { x: 0, y: 0, el: 0, life: 0, aux: 0, owner: 0, flags: 0, tick: 0 };
/** 1 for the elements this layer skips: EMPTY, plus the shaded ones when shading is on. */
const skipFlat = new Uint8Array(256);
const skipShaded = new Uint8Array(256);
skipFlat[El.EMPTY] = 1;

/** Every non-empty cell, colored by its element (with per-cell shade jitter from aux). */
registerLayer({
  name: 'cells',
  order: 10,
  kind: 'pixels',
  draw: ({ pixels, world, shaded }) => {
    if (shaded) {
      resolveShaders();
      for (let e = 0; e < 256; e++) skipShaded[e] = e === El.EMPTY || SHADED[e] ? 1 : 0;
    }
    const skip = shaded ? skipShaded : skipFlat;
    const { el, life, aux, owner, flags, w, size } = world;
    view.tick = world.tick;
    for (let i = 0; i < size; i++) {
      const e = el[i];
      if (skip[e]) continue;
      const def = ELEMENTS[e];
      if (!def) {
        pixels[i] = 0xffff00ff; // unregistered element: loud magenta
        continue;
      }
      view.x = i % w;
      view.y = (i / w) | 0;
      view.el = e;
      view.life = life[i];
      view.aux = aux[i];
      view.owner = owner[i];
      view.flags = flags[i];
      pixels[i] = def.color(view);
    }
  },
});
