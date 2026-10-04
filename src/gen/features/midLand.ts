import { El } from '../../core/elements';
import { registerFeature } from '../../core/features';
import { registerParam } from '../../core/params';
import { artOf, PLANE } from '../artState';
import { recordMountain } from '../mountainStore';
import { inkWash } from '../paint/shaders';
import { rasterizeCoverage } from '../raster';
import { groundTop } from './ground';

registerParam({ key: 'landHeight', label: 'Land height', min: 0, max: 1, step: 0.01, default: 0.5 });

/** Pale ink for land at a middle distance. */
const INK: [number, number, number] = [124, 126, 122];

/**
 * Rolling land at a middle distance: one continuous band across the whole scroll, in the MID plane
 * behind the near mountains, so the valleys between them show land (and, when the land is cut
 * through, the far ridges behind it). `landHeight` sets how high the band rises above the ground.
 * Trees grow along its skyline like they do on mountains.
 */
registerFeature({
  name: 'midLand',
  label: 'Mid land',
  order: 8,
  run: ({ bp, dims, params, noise, newStroke }) => {
    const lh = Math.max(0, Math.min(1, params.landHeight));
    if (lh <= 0) return;
    const { planes, u } = artOf(bp);
    const K = u.k;
    const mid = planes[PLANE.MID];
    const ground = groundTop(dims.h) * K;
    const reach = u.toArt(30 + 110 * lh); // how high the band can rise above the ground
    const tops = new Float32Array(u.artW);
    let peak = 0;
    for (let x = 0; x < u.artW; x++) {
      const n = noise.fbm1(x / u.toArt(260), 3);
      tops[x] = ground - reach * (0.3 + 0.7 * Math.min(1, Math.max(0, (n - 0.25) * 2)));
      if (tops[x] < tops[peak]) peak = x;
    }
    const cell = (v: number) => Math.floor(v / K);
    const id = newStroke({ kind: 'rock', bbox: [0, cell(tops[peak]), dims.w - 1, dims.h - 1], anchor: [cell(peak), cell(tops[peak])] });
    const shader = inkWash({ ink: INK, paper: [238, 232, 216], base: 0.05, edge: 0.3, edgeWidth: K * 4, speckle: 0.12, noise });
    mid.paint.fillColumns(0, tops, ground + K, shader, id);
    const ridge: [number, number][] = [];
    for (let x = 0; x < u.artW; x += 3) ridge.push([x, tops[x]]);
    mid.paint.stroke(ridge, { width: K * 0.5, color: ((70 << 24) | (INK[2] << 16) | (INK[1] << 8) | INK[0]) >>> 0, noise: 0.5 }, noise);
    rasterizeCoverage(bp, mid.buf, K, id, El.ROCK, mid.grid, [0, cell(tops[peak]), dims.w - 1, cell(ground + K)], true);
    recordMountain(bp, {
      id,
      depth: 'mid',
      plane: PLANE.MID,
      profile: { x0: 0, tops, layers: [], base: ground, peakX: peak, peakY: tops[peak] },
    });
  },
});
