import { El } from '../../core/elements';
import { registerFeature } from '../../core/features';
import { artOf } from '../artState';
import { mountainsOf } from '../mountainStore';
import type { Depth } from '../plan';
import { rasterizeCoverage } from '../raster';
import { getSpecies } from '../species';

/** Ink per depth row: farther trees are paler. */
const INK: Record<Depth, [number, number, number]> = { near: [92, 94, 90], mid: [126, 128, 124], far: [160, 162, 160] };

interface Spot {
  x: number;
  y: number;
  species: string;
  /** Size in painting units. */
  size: number;
  depth: Depth;
  plane: number;
  host: number;
}

/**
 * Vegetation grown on each mountain's contour grid, by zone (the shan-shui way, own rules):
 * - rim: small leaf clusters along the silhouette, above the lowest fifth
 * - top: leaf clusters scattered over the upper half
 * - middle: slim trees low on the slopes, kept only where they stand in a clump
 * - bottom: taller edge trees at the mountain's feet
 * Sparse power-of-noise thresholds make clumps; tree density scales them (0 = none).
 * Trees live in the objects plane in front of their mountain (so burning one exposes its rock),
 * grouped under that mountain, and only where that mountain is the visible one.
 */
registerFeature({
  name: 'trees',
  label: 'Trees',
  order: 20,
  run: (ctx) => {
    const { bp, dims, params, rng, noise, newStroke } = ctx;
    const td = Math.max(0, Math.min(1, params.treeDensity));
    if (td <= 0) return;
    const dens = td / 0.4; // the default slider (0.4) gives the reference's density
    const { planes, u } = artOf(bp);
    const K = u.k;
    const cellAt = (x: number, y: number) => {
      const cx = Math.floor(x / K);
      const cy = Math.floor(y / K);
      return cx < 0 || cy < 0 || cx >= dims.w || cy >= dims.h ? -1 : cy * dims.w + cx;
    };

    for (const m of mountainsOf(bp)) {
      const G = m.profile.grid;
      if (!G) continue;
      const grid = planes[m.plane].grid;
      const seed = m.id * 1.37;
      const base = m.profile.base;
      const H = Math.max(1, base - m.profile.peakY);
      /** This mountain is the one showing at that point (not hidden by a nearer one in its plane). */
      const ours = (x: number, y: number) => {
        const c = cellAt(x, y + K);
        return c >= 0 && grid.owner[c] === m.id;
      };
      const spots: Spot[] = [];
      const add = (x: number, y: number, species: string, size: number) =>
        spots.push({ x, y, species, size, depth: m.depth, plane: m.plane, host: m.id });

      // rim
      for (let j = 0; j < G[0].length; j++) {
        const [x, y] = G[0][j];
        const ns = noise.n2(j * 0.1, seed);
        if (ns * ns * ns < 0.1 * dens && (base - y) / H > 0.2 && ours(x, y)) add(x, y - u.toArt(4), 'leafCluster', rng.range(12, 20));
      }
      // top
      for (let i = 0; i < G.length; i++) {
        for (let j = 0; j < G[i].length; j++) {
          const [x, y] = G[i][j];
          const ns = noise.n2(i * 0.1 + seed, j * 0.1 + 2);
          if (ns * ns * ns < 0.06 * dens && (base - y) / H > 0.5 && ours(x, y)) add(x, y, 'leafCluster', rng.range(10, 18));
        }
      }
      // middle (clumped)
      const mids: [number, number][] = [];
      for (let i = 0; i < G.length; i++) {
        for (let j = 1; j < G[i].length; j += 2) {
          const [x, y] = G[i][j];
          const ns = noise.n2(i * 0.2 + seed, j * 0.05);
          if (ns * ns * ns * ns < 0.012 * dens && (base - y) / H < 0.3 && ours(x, y)) mids.push([x, y]);
        }
      }
      const r2 = u.toArt(30) ** 2;
      for (const [x, y] of mids) {
        let near = 0;
        for (const [ox, oy] of mids) if ((ox - x) ** 2 + (oy - y) ** 2 < r2) near++;
        if (near > 3) add(x, y, 'slim', 70 * ((base - y) / H + 0.15) * rng.range(0.4, 1));
      }
      // bottom edges
      for (let i = 0; i < G.length; i++) {
        for (const j of [0, G[i].length - 1]) {
          const [x, y] = G[i][j];
          const ns = noise.n2(i * 0.2 + seed, j * 0.05 + 5);
          if (ns * ns * ns * ns < 0.012 * dens && ours(x, y)) add(x, y, 'edgeTree', rng.range(55, 110));
        }
      }

      const objects = planes[m.plane - 1]; // the objects plane right in front of the mountain's plane
      for (const s of spots) {
        const id = newStroke({ kind: 'tree', bbox: [0, 0, 0, 0], anchor: [Math.floor(s.x / K), Math.floor(s.y / K)], group: s.host });
        const box = getSpecies(s.species).grow({
          paint: objects.paint,
          x: s.x,
          y: s.y,
          size: u.toArt(s.size) * (s.depth === 'mid' ? 0.8 : 1),
          owner: id,
          rng,
          noise,
          ink: INK[s.depth],
          k: K,
        });
        const cells = rasterizeCoverage(bp, objects.buf, K, id, El.TREE, objects.grid, [Math.floor(box[0] / K), Math.floor(box[1] / K), Math.floor(box[2] / K), Math.floor(box[3] / K)], false);
        const info = bp.registry.strokes.get(id);
        if (!cells) bp.registry.strokes.delete(id);
        else if (info) info.bbox = cells;
      }
    }
  },
});
