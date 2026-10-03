import { El } from '../../core/elements';
import { registerFeature } from '../../core/features';
import { put, surfaceY } from '../raster';

/** [center x, half width, height], as fractions of the grid. */
const BUMPS: [number, number, number][] = [
  [0.14, 0.07, 0.45],
  [0.36, 0.1, 0.7],
  [0.6, 0.08, 0.55],
  [0.84, 0.09, 0.35],
];

/**
 * PHASE 0 STUB: a few hardcoded rock bumps on the ground, lightly jittered by the seed and shaped
 * by mountainHeight and ruggedness. To be replaced by A's real mountain features.
 */
registerFeature({
  name: 'stubBumps',
  label: 'Rock bumps (stub)',
  order: 10,
  run: ({ bp, dims, params, rng, noise, newStroke }) => {
    const octaves = Math.max(1, Math.round(params.ruggedness));
    for (const [fx, fw, fh] of BUMPS) {
      const cx = Math.round(dims.w * (fx + rng.range(-0.02, 0.02)));
      const hw = Math.max(2, Math.round(dims.w * fw));
      const peakH = dims.h * fh * params.mountainHeight * rng.range(0.85, 1.15);
      if (peakH < 1) continue;

      const cols: { x: number; base: number; top: number }[] = [];
      for (let x = Math.max(0, cx - hw); x <= Math.min(dims.w - 1, cx + hw); x++) {
        const env = Math.cos(((x - cx) / hw) * (Math.PI / 2));
        const rough = 0.75 + 0.5 * noise.fbm1(x * 0.06, octaves, 0.55);
        const colH = Math.round(peakH * env * rough);
        if (colH <= 0) continue;
        const base = surfaceY(bp, x);
        cols.push({ x, base, top: Math.max(0, base - colH) });
      }
      if (cols.length === 0) continue;

      let peak = cols[0];
      for (const c of cols) if (c.top < peak.top) peak = c;
      const id = newStroke({
        kind: 'mountain',
        bbox: [cols[0].x, peak.top, cols[cols.length - 1].x, Math.max(...cols.map((c) => c.base)) - 1],
        anchor: [peak.x, peak.top],
      });
      for (const c of cols) for (let y = c.top; y < c.base; y++) put(bp, c.x, y, El.ROCK, id);
    }
  },
});
