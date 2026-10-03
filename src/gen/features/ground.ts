import { El } from '../../core/elements';
import { registerFeature } from '../../core/features';
import { artOf } from '../artState';
import { inkWash } from '../paint/shaders';
import { rasterizeCoverage } from '../raster';

/** Top row (in cells) of the ground bank. Shared with the stub bumps so they sit on it. */
export function groundTop(h: number): number {
  return h - Math.max(2, Math.round(h * 0.06));
}

/**
 * PHASE 0 STUB (art version): a low, gently wavy bank along the bottom. Runs after the mountains
 * (order 15) so the bank is in front of every mountain's foot; trees (20) then stand on it.
 */
registerFeature({
  name: 'ground',
  label: 'Ground (stub)',
  order: 15,
  run: ({ bp, dims, noise, newStroke }) => {
    const { fg, fgPaint, u } = artOf(bp);
    const top = groundTop(dims.h);
    const id = newStroke({ kind: 'rock', bbox: [0, top, dims.w - 1, dims.h - 1], anchor: [dims.w >> 1, top] });
    const tops = new Float32Array(u.artW);
    for (let x = 0; x < u.artW; x++) tops[x] = top * u.k + (noise.fbm1(x * 0.004, 3) - 0.5) * u.k * 2;
    const shader = inkWash({ ink: [70, 66, 60], base: 0.12, edge: 0.45, edgeWidth: u.k * 2, speckle: 0.12, noise });
    fgPaint.fillColumns(0, tops, u.artH, shader, id);
    rasterizeCoverage(bp, fg, u.k, id, El.ROCK, bp, [0, top - 2, dims.w - 1, dims.h - 1], true);
  },
});
