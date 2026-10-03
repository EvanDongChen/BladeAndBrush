import { El } from '../../core/elements';
import { registerFeature } from '../../core/features';
import { artOf } from '../artState';
import { inkWash } from '../paint/shaders';
import { rasterizeCoverage, surfaceY } from '../raster';

/**
 * PHASE 0 STUB: evenly spaced lollipop trees (trunk + round canopy) standing on the surface.
 * Count follows treeDensity. Painted into the art; TREE cells follow coverage and only fill
 * empty cells. To be replaced by A's real vegetation.
 */
registerFeature({
  name: 'stubTrees',
  label: 'Trees (stub)',
  order: 20,
  run: ({ bp, dims, params, rng, noise, newStroke }) => {
    const { fg, fgPaint, u } = artOf(bp);
    const K = u.k;
    const shader = inkWash({ ink: [44, 62, 46], base: 0.35, edge: 0.4, edgeWidth: K * 2, speckle: 0.2, noise });
    const n = Math.round(params.treeDensity * 14);
    for (let t = 0; t < n; t++) {
      const slot = dims.w / n;
      const x = Math.round((t + 0.5) * slot + rng.range(-0.3, 0.3) * slot);
      if (x < 4 || x >= dims.w - 4) continue;
      const base = surfaceY(bp, x);
      const trunk = 2 + rng.int(3);
      const r = 2 + rng.int(2);
      const cy = base - trunk - r;
      if (cy - r < 0) continue;

      const id = newStroke({ kind: 'tree', bbox: [x - r, cy - r, x + r, base - 1], anchor: [x, base] });
      // Canopy: a disc, filled column by column (art pixels).
      const ccx = (x + 0.5) * K;
      const ccy = (cy + 0.5) * K;
      const rr = (r + 0.5) * K;
      const x0 = Math.floor(ccx - rr);
      const tops = new Float32Array(Math.ceil(2 * rr) + 1);
      const bots = new Float32Array(tops.length);
      for (let j = 0; j < tops.length; j++) {
        const dx = x0 + j + 0.5 - ccx;
        const hh = dx * dx < rr * rr ? Math.sqrt(rr * rr - dx * dx) : 0;
        tops[j] = hh > 0 ? ccy - hh : u.artH;
        bots[j] = hh > 0 ? ccy + hh : 0;
      }
      fgPaint.fillColumns(x0, tops, bots, shader, id);
      // Trunk: half a cell wide, centered, from the canopy down into the ground.
      const tx = x * K + Math.floor(K / 4);
      const trunkW = Math.max(1, Math.ceil(K / 2));
      fgPaint.fillColumns(tx, new Float32Array(trunkW).fill(ccy), base * K + K / 2, shader, id);
      rasterizeCoverage(bp, fg, K, id, El.TREE, bp, [x - r - 1, cy - r - 1, x + r + 1, base], false);
    }
  },
});
