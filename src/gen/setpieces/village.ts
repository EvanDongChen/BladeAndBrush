import { El, rgba } from '../../core/elements';
import { num, registerSetpiece } from '../../core/setpieces';
import { artOf, PLANE } from '../artState';
import { WOOD } from '../elements/wood';
import { mountainsOf } from '../mountainStore';
import { ink, inkStroke } from '../paint/strokes';
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

    // Where the villagers stand: in the open ground between the huts and at the ends of the village,
    // 8 cells apart, shared out over the gaps (widest first). Reserved before the trees, which only
    // take what is left, so the people always have room.
    const person = elementId('person');
    const standAt: number[] = [];
    if (person !== 0 && people > 0) {
      const gapsOpen: { a: number; b: number; n: number }[] = [];
      let from = cx0;
      for (const [a, b] of [...spans].sort((p, q) => p[0] - q[0])) {
        gapsOpen.push({ a: from + 3, b: a - 4, n: 0 });
        from = b + 1;
      }
      gapsOpen.push({ a: from + 3, b: cx1 - 3, n: 0 });
      const room = gapsOpen.filter((g) => g.b >= g.a).sort((p, q) => q.b - q.a - (p.b - p.a));
      const capacity = (g: { a: number; b: number }) => Math.floor((g.b - g.a) / 8) + 1;
      for (let placed = 0, again = true; placed < people && again; ) {
        again = false;
        for (const g of room) {
          if (placed >= people) break;
          if (g.n < capacity(g)) (g.n++, placed++, (again = true));
        }
      }
      for (const g of room) {
        for (let j = 0; j < g.n; j++) standAt.push(g.n === 1 ? (g.a + g.b) >> 1 : Math.round(g.a + ((g.b - g.a) * j) / (g.n - 1)));
      }
      for (const x of standAt) spans.push([x - 4, x + 4]);
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

    // Villagers on the open ground reserved for them above.
    for (const x of standAt) {
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

      // walls: paper-white planks down into the ground in every column, so the hut never floats
      const tops = new Float32Array(n).fill(eave * K);
      const bots = new Float32Array(n);
      for (let j = 0; j < n; j++) bots[j] = Math.min(dims.h, floorAt(Math.floor((ax0 + j) / K)) + 1) * K;
      objects.paint.fillColumns(ax0, tops, bots, wallWash, id);
      const line = (pts: [number, number][], wid: number, alpha: number, salt: number) =>
        inkStroke(objects.paint, pts, noise, { wid, color: ink(alpha, [74, 72, 68]), noi: 0.5, salt, widthFn: (t) => 0.55 + 0.45 * Math.sin(t * Math.PI) });
      // plank seams
      for (let x = ax0 + K * 1.6; x < ax1 - K; x += K * 1.6) line([[x, eave * K + K], [x + noise.n1(x) * K * 0.3, floor * K]], K * 0.22, 0.28, x);

      // door and window: dark ink openings (the cells stay wood)
      const doorX = ((x0 + x1) >> 1) + doorSide * Math.max(0, ((x1 - x0) >> 2) - 1);
      dark(doorX - 1, floor - Math.min(wallH - 1, 4), doorX + 1, floor - 1);
      const winX = ((x0 + x1) >> 1) - doorSide * Math.max(2, (x1 - x0) >> 2);
      dark(winX, eave + 2, winX + 1, eave + 3);

      // roof: a gable with eaves, paper-pale, drawn with parallel thatch strokes down each slope
      const over = 2 * K;
      const rx0 = ax0 - over;
      const rx1 = ax1 + over;
      const midX = (rx0 + rx1) / 2;
      const apex = (eave - roofH) * K;
      const eaveY = eave * K + K * 0.7;
      const rt = new Float32Array(rx1 - rx0);
      const rb = new Float32Array(rx1 - rx0);
      for (let j = 0; j < rt.length; j++) {
        const f = Math.abs(rx0 + j + 0.5 - midX) / ((rx1 - rx0) / 2);
        rt[j] = apex + f * (eaveY - apex);
        rb[j] = eaveY + K * 0.05;
      }
      objects.paint.fillColumns(rx0, rt, rb, roofWash, id);
      for (let x = rx0 + K * 0.8; x < rx1 - K * 0.5; x += K * 0.95) {
        const f = Math.abs(x - midX) / ((rx1 - rx0) / 2);
        const top = apex + f * (eaveY - apex) + K * (0.6 + 1.2 * noise.n1(x * 0.3));
        line([[x, top], [x + (x < midX ? -1 : 1) * K * 0.5, eaveY - K * 0.1]], K * 0.2, 0.3 + 0.25 * noise.n1(x * 0.17 + 9), x + 5);
      }

      // ink outline: eaves and ridge a little heavier, the walls fine
      line([[rx0, eaveY], [midX, apex], [rx1, eaveY]], K * 0.55, 0.85, 1);
      line([[rx0 + K * 0.5, eaveY + K * 0.3], [rx1 - K * 0.5, eaveY + K * 0.3]], K * 0.3, 0.5, 2);
      line([[ax0, eave * K + K], [ax0, floor * K]], K * 0.4, 0.7, 3);
      line([[ax1, eave * K + K], [ax1, floor * K]], K * 0.4, 0.7, 4);
      line([[ax0, floor * K], [ax1, floor * K]], K * 0.35, 0.5, 5);

      return rasterizeCoverage(bp, objects.buf, K, id, WOOD, objects.grid, [x0 - 2, eave - roofH - 1, x1 + 2, Math.min(dims.h - 1, floor)], false);
    }

    /** Darken the art over cells x0..x1, y0..y1 (a door, a window). */
    function dark(x0: number, y0: number, x1: number, y1: number): void {
      const c = rgba(44, 42, 40, 225);
      for (let y = y0 * K; y < (y1 + 1) * K; y++) {
        for (let x = x0 * K + 1; x < (x1 + 1) * K - 1; x++) if (x >= 0 && y >= 0 && x < u.artW && y < u.artH) objects.buf.blend(y * u.artW + x, c);
      }
    }
  },
});

/** Wall wash: paper with the faintest warm-grey tone. */
function wallWash(x: number, y: number): number {
  const t = 0.04 + 0.03 * ((x * 7 + y * 13) % 5);
  return rgba(Math.round(241 - 70 * t), Math.round(235 - 72 * t), Math.round(220 - 76 * t));
}

/** Roof wash: a little darker than the walls, deepest under the ridge. */
function roofWash(_x: number, _y: number, dTop: number): number {
  const t = Math.min(0.2, 0.08 + dTop * 0.003);
  return rgba(Math.round(238 - 80 * t), Math.round(231 - 80 * t), Math.round(214 - 84 * t));
}
