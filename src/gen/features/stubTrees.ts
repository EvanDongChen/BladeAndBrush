import { El } from '../../core/elements';
import { registerFeature } from '../../core/features';
import { put, surfaceY } from '../raster';

/**
 * PHASE 0 STUB: evenly spaced lollipop trees (trunk + round canopy) standing on the surface.
 * Count follows treeDensity. To be replaced by A's real vegetation.
 */
registerFeature({
  name: 'stubTrees',
  label: 'Trees (stub)',
  order: 20,
  run: ({ bp, dims, params, rng, newStroke }) => {
    const n = Math.round(params.treeDensity * 14);
    for (let k = 0; k < n; k++) {
      const slot = dims.w / n;
      const x = Math.round((k + 0.5) * slot + rng.range(-0.3, 0.3) * slot);
      if (x < 4 || x >= dims.w - 4) continue;
      const base = surfaceY(bp, x);
      const trunk = 2 + rng.int(3);
      const r = 2 + rng.int(2);
      const cy = base - trunk - r;
      if (cy - r < 0) continue;

      const id = newStroke({ kind: 'tree', bbox: [x - r, cy - r, x + r, base - 1], anchor: [x, base] });
      for (let y = base - trunk; y < base; y++) put(bp, x, y, El.TREE, id);
      for (let y = cy - r; y <= cy + r; y++) {
        for (let xx = x - r; xx <= x + r; xx++) {
          if ((xx - x) ** 2 + (y - cy) ** 2 <= r * r + 1) put(bp, xx, y, El.TREE, id);
        }
      }
    }
  },
});
