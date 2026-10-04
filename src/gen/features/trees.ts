import { El } from '../../core/elements';
import { registerFeature } from '../../core/features';
import { artOf, PLANE } from '../artState';
import { mountainsOf } from '../mountainStore';
import type { Depth } from '../plan';
import { rasterizeCoverage } from '../raster';
import { getSpecies } from '../species';
import { DEPTH } from '../layout';
import { foregroundTrees } from './foregroundTrees';

/** Size range per species, in painting units, before perspective scaling. */
const SIZE: Record<string, [number, number]> = { pine: [30, 60], round: [33, 66], tall: [50, 95] };
const INK: Record<Depth, [number, number, number]> = { near: [46, 52, 46], mid: [128, 134, 128], far: [160, 162, 160] };

interface Spot {
  x: number;
  y: number;
  zone: string;
  depth: Depth;
  /** 0 at the foot, 1 at the peak. */
  f: number;
  /** Which line it was sampled from (spacing is kept per line). */
  line: number;
  /** Growing over its host's rock (a ridge line across the face) rather than against the sky. */
  face: boolean;
  /** The terrain plane the tree stands on; its objects plane is the one in front of it. */
  plane: number;
  /** Registry id of the mountain / land / ground it stands on (its group). */
  host: number;
}

/**
 * Trees in clumps, standing on every exposed silhouette (ridges, slopes, the ground bank) and
 * along the ridge lines across mountain faces. Trees live in the OBJECTS plane in front of the
 * terrain they stand on, so a burnt tree exposes the rock behind it (no hole), and a tree on a
 * hidden mid ridge stays behind the near mountains.
 * Low-frequency noise picks clumps; tree density sets how much of each silhouette they claim.
 * Species follow the height on the mountain: pines up top, round trees on slopes, tall trees at
 * the foot. Each tree is one stroke (owner).
 */
registerFeature({
  name: 'trees',
  label: 'Trees',
  order: 20,
  run: (ctx) => {
    const { bp, dims, params, rng, noise, newStroke } = ctx;
    const td = Math.max(0, Math.min(1, params.treeDensity));
    if (td <= 0) return;
    const { planes, u } = artOf(bp);
    const K = u.k;
    const step = Math.max(1, Math.round(u.toArt(5)));
    const thr = 0.5 * td * td;
    const cellAt = (x: number, y: number) => {
      const cx = Math.floor(x / K);
      const cy = Math.floor(y / K);
      return cx < 0 || cy < 0 || cx >= dims.w || cy >= dims.h ? -1 : cy * dims.w + cx;
    };
    /** The point is on the surface of `owner` in its plane, with open sky (in that plane) right above. */
    const exposed = (plane: number, x: number, y: number, owner: number) => {
      const g = planes[plane].grid;
      const here = cellAt(x, y + K * 0.5);
      const above = cellAt(x, y - K);
      return here >= 0 && above >= 0 && g.owner[here] === owner && g.el[here] !== El.EMPTY && g.el[above] === El.EMPTY;
    };
    const keep = (x: number, salt: number) => {
      const n = noise.n2(u.artToUnit(x) / 90, salt);
      return n * n * n < thr;
    };
    // Ground groves are occasional: sparser and in wider-spaced clumps than on the ridges.
    const keepGround = (x: number) => {
      const n = noise.n2(u.artToUnit(x) / 160, 991.7);
      return n * n * n < thr * 0.08;
    };
    const keepFace = (x: number, salt: number) => {
      const n = noise.n2(u.artToUnit(x) / 70, salt);
      return n * n * n < thr * 0.45;
    };

    const spots: Spot[] = [];
    let line = 0;
    for (const m of mountainsOf(bp)) {
      const { x0, tops, layers, base, peakY } = m.profile;
      const span = Math.max(1, base - peakY);
      const zoneOf = (f: number) => (f > 0.6 ? 'pine' : f > 0.25 ? 'round' : 'tall');
      line++;
      for (let j = 0; j < tops.length; j += step) {
        const x = x0 + j;
        const y = tops[j];
        if (y >= base || !exposed(m.plane, x, y, m.id) || !keep(x, m.id * 7.3)) continue;
        const f = (base - y) / span;
        spots.push({ x, y, depth: m.depth, f, zone: zoneOf(f), line, face: false, plane: m.plane, host: m.id });
      }
      // Ridge lines across the face: sparser, wherever this mountain's rock is.
      const grid = planes[m.plane].grid;
      for (let l = 0; l < layers.length; l++) {
        line++;
        const layer = layers[l];
        for (let j = 0; j < layer.length; j += step) {
          const x = x0 + j;
          const y = layer[j];
          if (y >= base - K * 4) continue;
          const here = cellAt(x, y + K * 0.5);
          if (here < 0 || grid.owner[here] !== m.id || grid.el[here] !== El.ROCK || !keepFace(x, m.id * 3.1 + l * 17)) continue;
          const f = (base - y) / span;
          spots.push({ x, y, depth: m.depth, f, zone: zoneOf(f), line, face: true, plane: m.plane, host: m.id });
        }
      }
    }
    // The ground bank (in the near plane): find its owner and walk its top edge.
    const bank = bp.registry.strokes.get(planes[PLANE.NEAR].grid.owner[(dims.h - 1) * dims.w]); // the ground: owns the bottom row
    if (bank) {
      line++;
      const nearBuf = planes[PLANE.NEAR].buf;
      const yMin = Math.floor((DEPTH.floor * dims.h - 4) * K);
      for (let x = 0; x < u.artW; x += step) {
        let y = yMin;
        while (y < u.artH && nearBuf.own[y * u.artW + x] !== bank.id) y++;
        if (y < u.artH && exposed(PLANE.NEAR, x, y, bank.id) && keepGround(x))
          spots.push({ x, y, depth: 'near', f: 0, zone: 'tall', line, face: false, plane: PLANE.NEAR, host: bank.id });
      }
    }

    // Back to front so nearer trees overlap farther ones.
    spots.sort((a, b) => (a.depth === b.depth ? 0 : a.depth === 'mid' ? -1 : 1));
    const last = new Map<number, [number, number]>(); // line -> [x, size] of the last tree kept
    for (const s of spots) {
      const [lo, hi] = SIZE[s.zone];
      const size = Math.max(
        u.toArt(18),
        u.toArt(rng.range(lo, hi)) * (1 - 0.45 * s.f) * (s.depth === 'mid' ? 0.55 : 1) * (s.face ? 0.75 : 1),
      );
      const prev = last.get(s.line);
      if (prev && Math.abs(s.x - prev[0]) < 0.35 * Math.min(size, prev[1])) continue;
      last.set(s.line, [s.x, size]);
      const objects = planes[s.plane - 1]; // PLANE.NEAR_OBJ / MID_OBJ sit right in front of their terrain
      const id = newStroke({ kind: 'tree', bbox: [0, 0, 0, 0], anchor: [Math.floor(s.x / K), Math.floor(s.y / K)], group: s.host });
      const box = getSpecies(s.zone).grow({ paint: objects.paint, x: s.x, y: s.y + K * 0.5, size, owner: id, rng, noise, ink: INK[s.depth], k: K });
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
    foregroundTrees(ctx);
  },
});
