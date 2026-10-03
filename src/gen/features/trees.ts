import { El } from '../../core/elements';
import { registerFeature } from '../../core/features';
import { artOf } from '../artState';
import { mountainsOf } from '../mountainStore';
import type { Depth } from '../plan';
import { rasterizeCoverage } from '../raster';
import { getSpecies } from '../species';
import { groundTop } from './ground';

/** Size range per species, in painting units, before perspective scaling. */
const SIZE: Record<string, [number, number]> = { pine: [45, 90], round: [50, 100], tall: [90, 170] };
const INK: Record<Depth, [number, number, number]> = { near: [46, 52, 46], mid: [128, 134, 128], far: [160, 162, 160] };

interface Spot {
  x: number;
  y: number;
  zone: string;
  depth: Depth;
  /** 0 at the foot, 1 at the peak. */
  f: number;
}

/**
 * Trees in clumps, standing on every exposed silhouette (ridges, slopes, the ground bank).
 * Low-frequency noise picks clumps; tree density sets how much of each silhouette they claim.
 * Species follow the height on the mountain: pines up top, round trees on slopes, tall trees at
 * the foot. Each tree is one stroke (owner); its TREE cells only fill empty cells.
 */
registerFeature({
  name: 'trees',
  label: 'Trees',
  order: 20,
  run: ({ bp, dims, params, rng, noise, newStroke }) => {
    const td = Math.max(0, Math.min(1, params.treeDensity));
    if (td <= 0) return;
    const { fg, fgPaint, u } = artOf(bp);
    const K = u.k;
    const step = Math.max(1, Math.round(u.toArt(5)));
    const thr = 0.5 * td * td;
    const cellAt = (x: number, y: number) => {
      const cx = Math.floor(x / K);
      const cy = Math.floor(y / K);
      return cx < 0 || cy < 0 || cx >= dims.w || cy >= dims.h ? -1 : cy * dims.w + cx;
    };
    /** The point is on the surface of `owner` and open sky is right above it. */
    const exposed = (x: number, y: number, owner: number) => {
      const here = cellAt(x, y + K * 0.5);
      const above = cellAt(x, y - K);
      return here >= 0 && above >= 0 && bp.owner[here] === owner && bp.el[here] !== El.EMPTY && bp.el[above] === El.EMPTY;
    };
    const keep = (x: number, salt: number) => {
      const n = noise.n2(u.artToUnit(x) / 90, salt);
      return n * n * n < thr;
    };

    const spots: Spot[] = [];
    for (const m of mountainsOf(bp)) {
      const { x0, tops, base, peakY } = m.profile;
      const span = Math.max(1, base - peakY);
      for (let j = 0; j < tops.length; j += step) {
        const x = x0 + j;
        const y = tops[j];
        if (y >= base || !exposed(x, y, m.id) || !keep(x, m.id * 7.3)) continue;
        const f = (base - y) / span;
        spots.push({ x, y, depth: m.depth, f, zone: f > 0.6 ? 'pine' : f > 0.25 ? 'round' : 'tall' });
      }
    }
    // The ground bank: find its owner and walk its top edge.
    const bank = [...bp.registry.strokes.values()].find((s) => s.kind === 'rock');
    if (bank) {
      const yMin = (groundTop(dims.h) - 2) * K;
      for (let x = 0; x < u.artW; x += step) {
        let y = yMin;
        while (y < u.artH && fg.own[y * u.artW + x] !== bank.id) y++;
        if (y < u.artH && exposed(x, y, bank.id) && keep(x, 991.7)) spots.push({ x, y, depth: 'near', f: 0, zone: 'tall' });
      }
    }

    // Back to front so nearer trees overlap farther ones.
    spots.sort((a, b) => (a.depth === b.depth ? 0 : a.depth === 'mid' ? -1 : 1));
    let lastX = -Infinity;
    let lastSize = 0;
    for (const s of spots) {
      const [lo, hi] = SIZE[s.zone];
      const size = Math.max(u.toArt(20), u.toArt(rng.range(lo, hi)) * (1 - 0.45 * s.f) * (s.depth === 'mid' ? 0.55 : 1));
      if (Math.abs(s.x - lastX) < 0.35 * Math.min(size, lastSize)) continue;
      lastX = s.x;
      lastSize = size;
      const id = newStroke({ kind: 'tree', bbox: [0, 0, 0, 0], anchor: [Math.floor(s.x / K), Math.floor(s.y / K)] });
      const box = getSpecies(s.zone).grow({ paint: fgPaint, x: s.x, y: s.y + K * 0.5, size, owner: id, rng, noise, ink: INK[s.depth], k: K });
      const cells = rasterizeCoverage(
        bp,
        fg,
        K,
        id,
        El.TREE,
        bp,
        [Math.floor(box[0] / K), Math.floor(box[1] / K), Math.floor(box[2] / K), Math.floor(box[3] / K)],
        false,
      );
      const info = bp.registry.strokes.get(id);
      if (!cells) bp.registry.strokes.delete(id);
      else if (info) info.bbox = cells;
    }
  },
});
