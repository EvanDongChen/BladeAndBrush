import { El, rgba } from '../../core/elements';
import { registerFeature } from '../../core/features';
import { artOf } from '../artState';
import { inkWash } from '../paint/shaders';
import { rasterizeCoverage } from '../raster';
import { groundTop } from './ground';

/** [center x, half width, height], as fractions of the grid. */
const BUMPS: [number, number, number][] = [
  [0.14, 0.07, 0.45],
  [0.36, 0.1, 0.7],
  [0.6, 0.08, 0.55],
  [0.84, 0.09, 0.35],
];

const OUTLINE = rgba(46, 42, 40, 136);

/**
 * PHASE 0 STUB: a few hardcoded rock bumps on the ground, lightly jittered by the seed and shaped
 * by mountainHeight and ruggedness. Painted into the art first; cells follow the art's coverage.
 * To be replaced by A's real mountain features.
 */
registerFeature({
  name: 'stubBumps',
  label: 'Rock bumps (stub)',
  order: 10,
  run: ({ bp, dims, params, rng, noise, newStroke }) => {
    const { fg, fgPaint, u } = artOf(bp);
    const octaves = Math.max(1, Math.round(params.ruggedness));
    const baseY = groundTop(dims.h) * u.k;
    const cell = (v: number) => Math.floor(v / u.k);
    for (const [fx, fw, fh] of BUMPS) {
      const cx = u.artW * (fx + rng.range(-0.02, 0.02));
      const hw = Math.max(2 * u.k, u.artW * fw);
      const peakH = u.artH * fh * params.mountainHeight * rng.range(0.85, 1.15);
      if (peakH < u.k) continue;

      const xa = Math.max(0, Math.floor(cx - hw));
      const xb = Math.min(u.artW - 1, Math.ceil(cx + hw));
      const tops = new Float32Array(xb - xa + 1);
      let peak = 0;
      for (let j = 0; j < tops.length; j++) {
        const env = Math.cos(((xa + j - cx) / hw) * (Math.PI / 2));
        const rough = 0.75 + 0.5 * noise.fbm1((xa + j) * (0.06 / u.k), octaves, 0.55);
        tops[j] = env > 0 ? Math.max(0, baseY - peakH * env * rough) : u.artH;
        if (tops[j] < tops[peak]) peak = j;
      }

      const id = newStroke({ kind: 'mountain', bbox: [cell(xa), 0, cell(xb), dims.h - 1], anchor: [cell(xa + peak), cell(tops[peak])] });
      const shader = inkWash({ ink: [46, 43, 40], base: 0.18, edge: 0.55, edgeWidth: u.k * 3, speckle: 0.15, noise });
      fgPaint.fillColumns(xa, tops, baseY + u.k, shader, id);
      const outline: [number, number][] = [];
      for (let j = 0; j < tops.length; j += 2) if (tops[j] < baseY) outline.push([xa + j, tops[j]]);
      fgPaint.stroke(outline, { width: u.k * 0.6, color: OUTLINE, noise: 0.6 }, noise);

      const bb = rasterizeCoverage(bp, fg, u.k, id, El.ROCK, bp, [cell(xa), 0, cell(xb), dims.h - 1], false);
      const info = bp.registry.strokes.get(id);
      if (info && bb) info.bbox = bb;
    }
  },
});
