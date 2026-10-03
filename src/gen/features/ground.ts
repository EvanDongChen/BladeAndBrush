import { El } from '../../core/elements';
import { registerFeature } from '../../core/features';
import { put } from '../raster';

/** PHASE 0 STUB: a flat band of ground rock along the bottom. */
registerFeature({
  name: 'ground',
  label: 'Ground (stub)',
  order: 0,
  run: ({ bp, dims, newStroke }) => {
    const top = dims.h - Math.max(2, Math.round(dims.h * 0.06));
    const id = newStroke({ kind: 'rock', bbox: [0, top, dims.w - 1, dims.h - 1], anchor: [dims.w >> 1, top] });
    for (let y = top; y < dims.h; y++) for (let x = 0; x < dims.w; x++) put(bp, x, y, El.ROCK, id);
  },
});
