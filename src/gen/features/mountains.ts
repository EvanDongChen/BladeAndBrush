import { El, rgba } from '../../core/elements';
import { registerFeature } from '../../core/features';
import { artOf } from '../artState';
import { contourWash } from '../paint/shaders';
import { planOf, type Placement } from '../plan';
import { rasterizeCoverage } from '../raster';
import { getShape } from '../shapes';
import { groundTop } from './ground';

/** Look per depth row: nearer is darker and more strongly outlined. */
const TONE = {
  near: { ink: [38, 36, 34] as [number, number, number], base: 0.08, edge: 0.55, band: 0.22, outline: 150, texture: 70, textureScale: 1, mist: 0 },
  mid: { ink: [120, 122, 122] as [number, number, number], base: 0.04, edge: 0.35, band: 0.1, outline: 55, texture: 35, textureScale: 0.5, mist: 160 },
};

/** The paper's own tone: mist fades into this rather than into the brighter occluder white. */
const PAPER_TONE: [number, number, number] = [236, 228, 210];

const DRAW_ORDER: Record<string, number> = { far: 0, mid: 1, near: 2 };

/**
 * Planned mountains (gen/plan.ts), back to front. Each is painted into the art (contour wash,
 * outline, texture strokes along its inner layers), then its ROCK cells follow the art's coverage;
 * nearer mountains overwrite farther ones.
 */
registerFeature({
  name: 'mountains',
  label: 'Mountains',
  order: 10,
  run: ({ bp, dims, params, rng, noise, newStroke }) => {
    const { fg, fgPaint, u } = artOf(bp);
    const K = u.k;
    const ground = groundTop(dims.h) * K;
    const placements = planOf(bp)
      .filter((p) => p.depth !== 'far' && (p.kind === 'peak' || p.kind === 'flat'))
      .sort((a, b) => DRAW_ORDER[a.depth] - DRAW_ORDER[b.depth] || a.x - b.x);
    const textureChance = 0.15 + 0.06 * Math.max(1, Math.min(8, params.ruggedness));

    const ids: number[] = [];
    for (const p of placements) paintMountain(p);
    pruneHidden(ids);

    function paintMountain(p: Placement): void {
      const tone = p.depth === 'mid' ? TONE.mid : TONE.near;
      const base = ground;
      const pr = getShape(p.kind).build(p, { u, params, base });
      if (pr.tops.length === 0) return;
      const cell = (v: number) => Math.floor(v / K);
      const id = newStroke({ kind: 'mountain', bbox: [0, 0, 0, 0], anchor: [cell(pr.peakX), cell(pr.peakY)] });
      ids.push(id);

      const shader = contourWash({
        ink: tone.ink,
        base: tone.base,
        edge: tone.edge,
        band: tone.band,
        // Mid row recedes: ink thins toward the foot into the paper tone, over a band scaled to
        // the mountain so short ones keep their ridge and do not become blank cutouts.
        paper: tone.mist > 0 ? PAPER_TONE : undefined,
        mist: tone.mist > 0 ? { from: base - Math.min(u.toArt(tone.mist), 0.6 * (base - pr.peakY)), to: base } : undefined,
        edgeWidth: K * 3,
        bandWidth: K * 1.5,
        speckle: 0.14,
        noise,
        x0: pr.x0,
        layers: pr.layers,
      });
      // Fill down to just inside the ground bank so no mountain floats.
      const tops = pr.tops.map((t) => (t < base ? t : u.artH));
      fgPaint.fillColumns(pr.x0, tops, ground + K, shader, id);

      // Outline along the silhouette.
      const outline: [number, number][] = [];
      for (let j = 0; j < tops.length; j += 2) if (tops[j] < base) outline.push([pr.x0 + j, tops[j]]);
      fgPaint.stroke(outline, { width: K * 0.7, color: rgba(...tone.ink, tone.outline), noise: 0.6 }, noise);

      // Texture: short strokes along the inner layers, more with ruggedness.
      const win = 24;
      for (const layer of pr.layers) {
        for (let j = 0; j + win < layer.length; j += win) {
          if (layer[j] >= base || !rng.chance(textureChance * tone.textureScale)) continue;
          const len = 16 + rng.int(33);
          const path: [number, number][] = [];
          for (let s = j; s < Math.min(layer.length, j + len); s += 2) if (layer[s] < base) path.push([pr.x0 + s, layer[s]]);
          fgPaint.stroke(path, { width: K * 0.35, color: rgba(...tone.ink, tone.texture), noise: 0.5 }, noise);
        }
      }

      rasterizeCoverage(bp, fg, K, id, El.ROCK, bp, [cell(pr.x0), 0, cell(pr.x0 + tops.length), dims.h - 1], true);
    }

    /** Nearer mountains may hide farther ones completely: drop those, and fit bboxes to what is left. */
    function pruneHidden(owned: number[]): void {
      const boxes = new Map<number, [number, number, number, number]>();
      const mine = new Set(owned);
      for (let y = 0; y < dims.h; y++) {
        for (let x = 0; x < dims.w; x++) {
          const o = bp.owner[y * dims.w + x];
          if (!mine.has(o)) continue;
          const b = boxes.get(o);
          if (!b) boxes.set(o, [x, y, x, y]);
          else {
            b[0] = Math.min(b[0], x);
            b[1] = Math.min(b[1], y);
            b[2] = Math.max(b[2], x);
            b[3] = Math.max(b[3], y);
          }
        }
      }
      for (const id of owned) {
        const b = boxes.get(id);
        const info = bp.registry.strokes.get(id);
        if (!b) bp.registry.strokes.delete(id);
        else if (info) info.bbox = b;
      }
    }
  },
});
