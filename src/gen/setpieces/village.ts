import { El, rgba } from '../../core/elements';
import type { Noise } from '../../core/noise';
import { num, registerSetpiece } from '../../core/setpieces';
import { artOf, PLANE } from '../artState';
import { WOOD } from '../elements/wood';
import { mountainsOf } from '../mountainStore';
import type { Shader } from '../paint/painter';
import { rasterizeCoverage } from '../raster';
import { elementId, reserveSpan, topAt, topIn } from '../setpieceKit';
import { getSpecies } from '../species';

/**
 * { type: 'village', x0: 0.62, x1: 0.92, huts: 3, trees: 2, people: 5, height?: 0.5 }
 *
 * A village on its own plateau in the foreground between x0 and x1 (fractions of the scroll):
 * wooden huts (WOOD cells, one 'hut' object each), a few trees between them (one 'tree' object
 * each) and villagers (PERSON creatures, one 'villager' object each, placed by the sim when the
 * frontier gets there). Huts and trees stand in the objects plane in front of the plateau. The
 * plateau is tagged 'village' too, so rain that lands on it counts for the village; so is
 * everything else here. The free mountains, plateau scenes and trees keep out of its span.
 */
registerSetpiece({
  type: 'village',
  label: 'Village',
  order: 12, // after the mountains (10) paint its plateau, before plateau scenes (15) and trees (20)
  places: (spec) => {
    const x0 = num(spec, 'x0', 0.6);
    const x1 = num(spec, 'x1', 0.9);
    return [{ x: (x0 + x1) / 2, kind: 'flat', height: num(spec, 'height', 0.5), y: 0.9, halfWidth: (x1 - x0) / 2 + 0.03 }];
  },
  clears: (spec) => [[num(spec, 'x0', 0.6) - 0.04, num(spec, 'x1', 0.9) + 0.04]],
  run: ({ bp, dims, rng, noise, newStroke }, spec) => {
    const { planes, u } = artOf(bp);
    const K = u.k;
    let cx0 = Math.max(0, Math.round(num(spec, 'x0', 0.6) * dims.w));
    let cx1 = Math.min(dims.w - 1, Math.round(num(spec, 'x1', 0.9) * dims.w));
    const huts = Math.max(0, Math.round(num(spec, 'huts', 3)));
    const trees = Math.max(0, Math.round(num(spec, 'trees', 0)));
    const people = Math.max(0, Math.round(num(spec, 'people', 4)));
    const scale = dims.h / 256;
    const mid = (cx0 + cx1) / 2;

    // The plateau the village stands on (its slab), if the mountains feature painted one here.
    const host = mountainsOf(bp).find((m) => m.slab && m.slab.x0 / K <= mid && m.slab.x1 / K >= mid);
    const ground = host ? planes[host.plane].grid : null;
    const objects = planes[host ? host.plane - 1 : PLANE.NEAR_OBJ];
    if (host?.slab) {
      cx0 = Math.max(cx0, Math.ceil(host.slab.x0 / K) + 2);
      cx1 = Math.min(cx1, Math.floor(host.slab.x1 / K) - 2);
      const info = bp.registry.strokes.get(host.id);
      if (info) info.tags = [...(info.tags ?? []), 'village'];
    }
    /** The ground under column x: the plateau's top, or the bottom of the scroll. */
    const floorAt = (x: number) => (ground ? Math.min(topIn(bp, ground, x), dims.h) : dims.h);
    reserveSpan(bp, cx0 - 4, cx1 + 4);
    newStroke({ kind: 'village', bbox: [cx0, floorAt(mid) - 1, cx1, dims.h - 1], anchor: [Math.round(mid), floorAt(mid)], tags: ['village'] });

    // Huts, evenly spread with a little jitter.
    const spans: [number, number][] = [];
    const span = cx1 - cx0;
    for (let k = 0; k < huts; k++) {
      const half = Math.round(rng.range(7, 9) * scale);
      const hx = Math.round(cx0 + (span * (k + 0.5)) / huts + rng.range(-1, 1) * (span / huts / 8));
      const x0 = Math.max(cx0, hx - half);
      const x1 = Math.min(cx1, hx + half);
      if (x1 - x0 < 6) continue;
      const id = newStroke({ kind: 'hut', bbox: [x0, 0, x1, 0], anchor: [hx, 0], tags: ['village'], group: host?.id });
      const box = hut(x0, x1, Math.round(rng.range(6, 8) * scale), Math.round(rng.range(5, 7) * scale), id, rng.chance(0.5) ? -1 : 1);
      const info = bp.registry.strokes.get(id);
      if (!box) bp.registry.strokes.delete(id);
      else if (info) {
        info.bbox = box;
        info.anchor = [hx, box[1]];
        spans.push([box[0], box[2]]);
      }
    }

    // Village trees in the gaps between the huts (and at the ends), clear of the walls.
    const gaps: number[] = [];
    const sorted = [...spans].sort((a, b) => a[0] - b[0]);
    for (let k = 1; k < sorted.length; k++) gaps.push((sorted[k - 1][1] + sorted[k][0]) >> 1);
    gaps.push(cx0 + 6, cx1 - 6);
    let planted = 0;
    for (const x of gaps) {
      if (planted >= trees || spans.some(([a, b]) => x >= a - 6 && x <= b + 6)) continue;
      const id = newStroke({ kind: 'tree', bbox: [x, 0, x, 0], anchor: [x, 0], tags: ['village'], group: host?.id });
      const foot = floorAt(x);
      const box = getSpecies('round').grow({ paint: objects.paint, x: (x + 0.5) * K, y: (foot + 0.5) * K, size: u.toArt(rng.range(55, 75)), owner: id, rng, noise, ink: [52, 58, 50], k: K });
      const cells = rasterizeCoverage(bp, objects.buf, K, id, El.TREE, objects.grid, [Math.floor(box[0] / K), Math.floor(box[1] / K), Math.floor(box[2] / K), Math.floor(box[3] / K)], false);
      const info = bp.registry.strokes.get(id);
      if (!cells) bp.registry.strokes.delete(id);
      else if (info) {
        info.bbox = cells;
        info.anchor = [x, cells[1]];
        spans.push([cells[0], cells[2]]);
        planted++;
      }
    }

    // Villagers on the open ground between the huts and trees.
    const person = elementId('person');
    if (person === 0 || people === 0) return;
    const free: number[] = [];
    for (let x = cx0 + 3; x <= cx1 - 3; x++) if (!spans.some(([a, b]) => x >= a - 4 && x <= b + 4)) free.push(x);
    if (free.length === 0) return;
    for (let k = 0; k < people; k++) {
      const x = free[Math.min(free.length - 1, Math.floor(((k + 0.5) * free.length) / people))];
      const y = topAt(bp, x) - 2;
      newStroke({
        kind: 'villager',
        bbox: [x - 3, y - 7, x + 3, y + 1],
        anchor: [x, y],
        tags: ['village'],
        spawn: { el: person, variant: rng.int(6), face: rng.chance(0.5) ? 1 : -1 },
      });
    }

    /**
     * One hut over cells x0..x1: plank walls `wallH` tall standing on the ground (down into it in
     * every column), a thatched roof `roofH` tall with eaves, a door and a window. Returns the cell
     * bbox of its WOOD cells, or null if none fit.
     */
    function hut(x0: number, x1: number, wallH: number, roofH: number, id: number, doorSide: number): [number, number, number, number] | null {
      let floor = dims.h;
      for (let x = x0; x <= x1; x++) floor = Math.min(floor, floorAt(x));
      const eave = floor - wallH;
      const ax0 = x0 * K;
      const ax1 = (x1 + 1) * K;
      const n = ax1 - ax0;

      // walls: down into the ground in every column, so the hut never floats
      const tops = new Float32Array(n).fill(eave * K);
      const bots = new Float32Array(n);
      for (let j = 0; j < n; j++) bots[j] = Math.min(dims.h, floorAt(Math.floor((ax0 + j) / K)) + 1) * K;
      objects.paint.fillColumns(ax0, tops, bots, planks(noise, K, ax0, ax1), id);

      // door and window: dark openings in the art (the cells stay wood)
      const doorX = ((x0 + x1) >> 1) + doorSide * Math.max(0, ((x1 - x0) >> 2) - 1);
      dark(doorX - 1, floor - Math.min(wallH - 1, 4), doorX + 1, floor - 1);
      const winX = ((x0 + x1) >> 1) - doorSide * Math.max(2, (x1 - x0) >> 2);
      dark(winX, eave + 2, winX + 1, eave + 3);

      // roof: a gable with eaves, thatch streaks
      const over = 2 * K;
      const rx0 = ax0 - over;
      const rx1 = ax1 + over;
      const midX = (rx0 + rx1) / 2;
      const apex = (eave - roofH) * K;
      const rt = new Float32Array(rx1 - rx0);
      const rb = new Float32Array(rx1 - rx0);
      for (let j = 0; j < rt.length; j++) {
        const f = Math.abs(rx0 + j + 0.5 - midX) / ((rx1 - rx0) / 2);
        rt[j] = apex + f * (eave * K + K * 0.5 - apex);
        rb[j] = eave * K + K * 0.75;
      }
      objects.paint.fillColumns(rx0, rt, rb, thatch(noise), id);

      // ink outline
      const brush = { width: K * 0.45, color: rgba(58, 44, 32, 210), noise: 0.4, taper: 0.2 };
      objects.paint.stroke([[rx0, eave * K + K * 0.6], [midX, apex], [rx1, eave * K + K * 0.6]], brush, noise);
      objects.paint.stroke([[ax0, eave * K + K], [ax0, floor * K]], brush, noise);
      objects.paint.stroke([[ax1, eave * K + K], [ax1, floor * K]], brush, noise);

      return rasterizeCoverage(bp, objects.buf, K, id, WOOD, objects.grid, [x0 - 2, eave - roofH - 1, x1 + 2, Math.min(dims.h - 1, floor)], false);
    }

    /** Darken the art over cells x0..x1, y0..y1 (a door, a window). */
    function dark(x0: number, y0: number, x1: number, y1: number): void {
      const c = rgba(48, 36, 28, 230);
      for (let y = y0 * K; y < (y1 + 1) * K; y++) {
        for (let x = x0 * K + 1; x < (x1 + 1) * K - 1; x++) if (x >= 0 && y >= 0 && x < u.artW && y < u.artH) objects.buf.blend(y * u.artW + x, c);
      }
    }
  },
});

/** Warm planks with darker seams every 1.5 cells and darker corner posts. */
function planks(noise: Noise, K: number, ax0: number, ax1: number): Shader {
  const seam = K * 1.5;
  return (x, y) => {
    let t = 0.5 + 0.25 * (noise.n2(x * 0.08, y * 0.6) - 0.5);
    if (y % seam < 1) t += 0.3;
    if (x - ax0 < K * 0.8 || ax1 - x < K * 0.8) t += 0.25;
    t = Math.min(1, t);
    return rgba(Math.round(168 - 90 * t), Math.round(124 - 70 * t), Math.round(82 - 46 * t));
  };
}

/** Straw thatch: light gold with vertical streaks, darker near the eave. */
function thatch(noise: Noise): Shader {
  return (x, y, dTop) => {
    const streak = noise.n2(x * 0.45, y * 0.05);
    const t = Math.min(1, 0.25 + 0.5 * streak + Math.min(0.3, dTop * 0.004));
    return rgba(Math.round(196 - 70 * t), Math.round(160 - 66 * t), Math.round(88 - 44 * t));
  };
}
