import { El } from '../../core/elements';
import { registerFeature } from '../../core/features';
import { registerParam } from '../../core/params';
import { artOf } from '../artState';
import { mountainsOf } from '../mountainStore';
import { paintRock } from '../paint/rock';
import { rasterizeCoverage } from '../raster';
import { getSpecies } from '../species';

registerParam({ key: 'boulderDensity', label: 'Boulders', min: 0, max: 1, step: 0.01, default: 0.5 });

/**
 * The foreground land: each flat mountain's ground slab gets a little scene, like the reference's
 * plateaus: always a few boulders, plus one arrangement (a big rock group, a row of slim trees, a
 * few big branching trees with rocks at their feet, edge trees, or a grove of leaf clusters), and
 * a sprinkle of small leaf clusters. Everything stands in the objects plane in front of the plateau
 * (breaking it exposes the ground), grouped under that plateau.
 */
registerFeature({
  name: 'plateaus',
  label: 'Plateau scenes',
  order: 15,
  run: ({ bp, dims, params, rng, noise, newStroke }) => {
    const { planes, u } = artOf(bp);
    const K = u.k;
    const rocks = Math.max(0, Math.min(1, params.boulderDensity)) / 0.5;
    const trees = Math.max(0, Math.min(1, params.treeDensity)) / 0.4;
    const cell = (v: number) => Math.floor(v / K);

    for (const m of mountainsOf(bp)) {
      const slab = m.slab;
      if (!slab) continue;
      const objects = planes[m.plane - 1];
      const grid = planes[m.plane].grid;
      const inkRGB: [number, number, number] = m.depth === 'mid' ? [126, 126, 124] : [96, 96, 94];
      const span = slab.x1 - slab.x0;
      const at = (t: number) => slab.x0 + span * t;
      /** The plateau is what shows there (a nearer mountain in its plane may cover part of it). */
      const ours = (x: number, y: number) => {
        const cx = cell(x);
        const cy = cell(y);
        return cx >= 0 && cy >= 0 && cx < dims.w && cy < dims.h && grid.owner[cy * dims.w + cx] === m.id;
      };
      /** Anything of the other kind already in the way: boulders carry no trees, trees stand clear of boulders. */
      const crowded = (kind: 'rock' | 'tree', ax: number, ay: number, r: number) => {
        const other = kind === 'rock' ? El.TREE : El.ROCK;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const cx = cell(ax) + dx;
            const cy = cell(ay) + dy;
            if (cx >= 0 && cy >= 0 && cx < dims.w && cy < dims.h && objects.grid.el[cy * dims.w + cx] === other) return true;
          }
        }
        return false;
      };
      const place = (kind: 'rock' | 'tree', draw: (id: number) => [number, number, number, number], ax: number, ay: number, r: number) => {
        if (!ours(ax, ay) || crowded(kind, ax, ay, r)) return;
        const id = newStroke({ kind, bbox: [0, 0, 0, 0], anchor: [cell(ax), cell(ay)], group: m.id });
        const box = draw(id);
        const cells = rasterizeCoverage(bp, objects.buf, K, id, kind === 'rock' ? El.ROCK : El.TREE, objects.grid, [cell(box[0]), cell(box[1]), cell(box[2]), cell(box[3])], false);
        const info = bp.registry.strokes.get(id);
        if (!cells) bp.registry.strokes.delete(id);
        else if (info) info.bbox = cells;
      };
      const groundY = () => slab.y + slab.depth * rng.range(-0.15, 0.25);
      const rock = (x: number, w: number, h: number) => {
        const y = groundY();
        place('rock', (id) => paintRock(objects.paint, x, y, u.toArt(w), u.toArt(h), id, rng, noise, u.toArt(1.2), inkRGB), x, y, Math.ceil(u.toArt(w) / K / 2));
      };
      const tree = (species: string, x: number, size: number) => {
        const y = groundY();
        place('tree', (id) => getSpecies(species).grow({ paint: objects.paint, x, y, size: u.toArt(size), owner: id, rng, noise, ink: inkRGB, k: K }), x, y, 2);
      };

      // trees and rocks are drawn back to front along the slab's depth by their own y (groundY)
      // scene weights: rock group, slim row, big trees, edge trees, leaf grove
      const roll = rng.next();
      const kind = roll < 0.2 ? 0 : roll < 0.33 ? 1 : roll < 0.68 ? 2 : roll < 0.8 ? 3 : 4;
      if (kind === 0) for (let i = 0; i < Math.round((1 + rng.int(3)) * rocks); i++) rock(at(rng.range(0.1, 0.9)), rng.range(30, 60), rng.range(25, 45));
      if (kind === 1 && trees > 0) {
        const a = rng.range(0, 0.4);
        const b = rng.range(0.6, 1);
        for (let t = a; t < b; t += 24 / Math.max(1, u.artToUnit(span)) / Math.max(0.3, trees)) tree('round', at(t), rng.range(30, 50));
      }
      if (kind === 2 && trees > 0) {
        for (let i = 0; i < Math.max(1, Math.round((1 + rng.int(3)) * Math.min(1, trees))); i++) {
          const x = at(rng.range(0.15, 0.85));
          tree('branchTree', x, rng.range(120, 230));
          for (let r = 0; r < Math.round(rng.int(3) * rocks); r++) rock(x + u.toArt(rng.range(-50, 50)), rng.range(30, 55), rng.range(22, 40));
        }
      }
      if (kind === 3 && trees > 0) for (let i = 0; i < Math.round((1 + rng.int(3)) * trees); i++) tree('tall', at(rng.range(0.1, 0.9)), rng.range(50, 90));
      if (kind === 4 && trees > 0) {
        const a = rng.range(0, 0.4);
        const b = rng.range(0.6, 1);
        for (let t = a; t < b; t += 18 / Math.max(1, u.artToUnit(span)) / Math.max(0.3, trees)) tree('pine', at(t), rng.range(28, 50));
      }
      // always: a few small boulders, and a sprinkle of small leaf clusters
      for (let i = 0; i < Math.round((2 + rng.int(4)) * rocks); i++) rock(at(rng.range(0.05, 0.95)), rng.range(22, 55), rng.range(18, 42));
      for (let i = 0; i < Math.round(rng.int(12) * trees); i++) tree('round', at(rng.range(0.05, 0.95)), rng.range(18, 30));
    }
  },
});
