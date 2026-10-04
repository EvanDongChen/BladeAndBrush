import { El } from '../../core/elements';
import type { FeatureCtx } from '../../core/features';
import { artOf, PLANE } from '../artState';
import { DEPTH } from '../layout';
import { rasterizeCoverage } from '../raster';
import { getSpecies } from '../species';

/**
 * A few big trees in the foreground, huge next to the mountains behind them like the reference's
 * pines: they stand on the foreground land, bigger the nearer they are to the viewer, in the near
 * objects plane (so a burnt one exposes the ground). tree density sets how many. Part of the
 * `trees` feature (called from it), so switching trees off switches these off too.
 */
export function foregroundTrees({ bp, dims, params, rng, noise, newStroke }: FeatureCtx): void {
    const td = Math.max(0, Math.min(1, params.treeDensity));
    const count = Math.round(1 + 5 * td);
    if (td <= 0) return;
    const { planes, u } = artOf(bp);
    const K = u.k;
    const land = bp.registry.strokes.get(planes[PLANE.NEAR].grid.owner[(dims.h - 1) * dims.w]);
    const objects = planes[PLANE.NEAR_OBJ];
    const top = DEPTH.foreTop * dims.h;
    const span = DEPTH.floor * dims.h - top; // depth of the foreground, in cells
    for (let n = 0; n < count; n++) {
      const t = 0.1 + 0.8 * rng.next(); // 0 = back of the land, 1 = nearest the viewer
      const x = u.artW * rng.range(0.03, 0.97);
      const y = (top + span * t) * K;
      const size = u.toArt(rng.range(140, 260) * (0.55 + 0.9 * t)); // nearer = bigger
      const species = rng.chance(0.55) ? 'pine' : 'tall';
      const id = newStroke({ kind: 'tree', bbox: [0, 0, 0, 0], anchor: [Math.floor(x / K), Math.floor(y / K)], group: land?.id });
      const box = getSpecies(species).grow({ paint: objects.paint, x, y, size, owner: id, rng, noise, ink: [40, 46, 40], k: K });
      const cells = rasterizeCoverage(
        bp,
        objects.buf,
        K,
        id,
        El.TREE,
        objects.grid,
        [Math.floor(box[0] / K), Math.floor(box[1] / K), Math.floor(box[2] / K), Math.floor(box[3] / K)],
        false,
      );
      const info = bp.registry.strokes.get(id);
      if (!cells) bp.registry.strokes.delete(id);
      else if (info) info.bbox = cells;
    }
}
