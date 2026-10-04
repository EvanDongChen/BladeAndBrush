import { El } from '../../core/elements';
import { registerFeature } from '../../core/features';
import { artOf, PLANE } from '../artState';
import { DEPTH } from '../layout';
import { hatch } from '../paint/hatch';
import { inkWash } from '../paint/shaders';
import { rasterizeCoverage } from '../raster';

/**
 * A thin floor along the bottom of the scroll, in the near plane: the land the viewer stands on,
 * drawn like the paper with a few long strokes, and somewhere for water and debris to land.
 */
registerFeature({
  name: 'ground',
  label: 'Ground (floor)',
  order: 15,
  run: ({ bp, dims, rng, noise, newStroke }) => {
    const { planes, u } = artOf(bp);
    const near = planes[PLANE.NEAR];
    const top = DEPTH.floor * dims.h;
    const id = newStroke({ kind: 'rock', bbox: [0, Math.floor(top), dims.w - 1, dims.h - 1], anchor: [dims.w >> 1, Math.floor(top)] });
    const tops = new Float32Array(u.artW);
    const roll = u.toArt(4);
    for (let x = 0; x < u.artW; x++) tops[x] = top * u.k + (noise.fbm1(x / u.toArt(200), 3) - 0.5) * 2 * roll;
    const shader = inkWash({ ink: [92, 88, 80], paper: [243, 237, 222], base: 0.02, edge: 0.25, edgeWidth: u.k * 2, speckle: 0.06, noise });
    near.paint.fillColumns(0, tops, u.artH, shader, id);
    // sparse long strokes across the land, thinning toward the viewer, like the reference
    hatch(near.paint, rng, noise, { x0: 0, x1: u.artW, top: top * u.k, bottom: u.artH, count: 30, ink: [90, 88, 84], alpha: 70, width: u.k * 0.35, wave: u.toArt(5) });
    rasterizeCoverage(bp, near.buf, u.k, id, El.ROCK, near.grid, [0, Math.floor(top) - 4, dims.w - 1, dims.h - 1], true);
  },
});
