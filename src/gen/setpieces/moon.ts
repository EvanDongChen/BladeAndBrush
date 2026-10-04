import { rgba } from '../../core/elements';
import { ArtBuffer } from '../paint/artBuffer';
import { PixelPainter } from '../paint/painter';
import { blob, ink, inkStroke } from '../paint/strokes';
import { num, registerSetpiece } from '../../core/setpieces';
import { artOf, PLANE } from '../artState';
import { MOON } from '../elements/moon';
import { rasterizeCoverage } from '../raster';

/**
 * { type: 'moon', x: 0.5, y: 0.2, r: 0.07, clear?: 0.07 }
 *
 * A full moon in the sky at (x, y) (fractions of the scroll), radius r (fraction of its height),
 * in the farthest mountain plane so anything nearer covers it. One object of kind 'moon'. The free
 * mountains leave the sky under it clear (`clear` = half width of that span).
 */
registerSetpiece({
  type: 'moon',
  label: 'Moon',
  order: 25,
  clears: (spec) => {
    const x = num(spec, 'x', 0.5);
    const half = num(spec, 'clear', 0.07);
    return [[x - half, x + half]];
  },
  run: ({ bp, dims, noise, newStroke }, spec) => {
    const { planes, u } = artOf(bp);
    const plane = planes[PLANE.MID];
    const K = u.k;
    const cx = num(spec, 'x', 0.5) * dims.w;
    const cy = num(spec, 'y', 0.2) * dims.h;
    const r = Math.max(2, num(spec, 'r', 0.07) * dims.h);
    const id = newStroke({ kind: 'moon', bbox: [0, 0, 0, 0], anchor: [Math.floor(cx), Math.floor(cy)], tags: ['moon'] });

    // A moon as an ink painter draws it: a paper-white disc, a thin shaded crescent on one side, a few
    // faint wash patches, a sketchy broken outline and a wisp of cloud. Drawn into a small scratch buffer, then copied only where the plane is empty.
    const R = r * K;
    const m = Math.ceil(R * 0.45) + K * 3;
    const x0 = Math.max(0, Math.floor(cx * K - R - m));
    const y0 = Math.max(0, Math.floor(cy * K - R - m));
    const bw = Math.min(u.artW - x0, Math.ceil(2 * (R + m)));
    const bh = Math.min(u.artH - y0, Math.ceil(2 * (R + m)));
    const tmp = new ArtBuffer(bw, bh, new Uint32Array(bw * bh));
    const paint = new PixelPainter(tmp);
    const ax = cx * K - x0;
    const ay = cy * K - y0;
    const paper = rgba(241, 235, 220);
    const circle = (rad: number, ox = 0, oy = 0, wob = 0.012, n = 72) =>
      Array.from({ length: n + 1 }, (_, i): [number, number] => {
        const t = (i / n) * Math.PI * 2;
        const rr = rad * (1 + wob * (noise.n2(Math.cos(t) * 1.7 + 5, Math.sin(t) * 1.7 + 5) - 0.5));
        return [ax + ox + Math.cos(t) * rr, ay + oy + Math.sin(t) * rr];
      });
    const arc = (rad: number, t0: number, t1: number, wob = 0.012): [number, number][] =>
      Array.from({ length: 28 }, (_, i): [number, number] => {
        const t = t0 + ((t1 - t0) * i) / 27;
        const rr = rad * (1 + wob * (noise.n2(Math.cos(t) * 2.3 + 11, Math.sin(t) * 2.3 + 11) - 0.5));
        return [ax + Math.cos(t) * rr, ay + Math.sin(t) * rr];
      });

    // the disc: shaded paper, then the lit paper offset toward the upper left, leaving a thin crescent
    paint.fillPolygon(circle(R), rgba(200, 196, 186), 1);
    paint.fillPolygon(circle(R * 0.9, -R * 0.095, -R * 0.075, 0.006), paper, 1);
    // wash patches (the dark seas) and crater rings, very faint
    for (let i = 0; i < 4; i++) {
      const t = noise.n1(i * 3.7 + 1) * Math.PI * 2;
      const d = R * 0.5 * noise.n1(i * 5.3 + 2);
      blob(paint, ax - R * 0.1 + Math.cos(t) * d, ay - R * 0.08 + Math.sin(t) * d, noise, {
        len: R * (0.3 + 0.35 * noise.n1(i + 9)),
        wid: R * (0.18 + 0.25 * noise.n1(i + 17)),
        ang: noise.n1(i * 2.9) * Math.PI,
        color: ink(0.1 + 0.07 * noise.n1(i + 4), [150, 148, 140]),
        noi: 0.7,
        point: 0.2,
        salt: i * 9,
      });
    }
    // a sketchy broken outline: three arcs with small gaps
    const o0 = noise.n1(77) * Math.PI * 2;
    for (let i = 0; i < 3; i++) {
      const t0 = o0 + (i * Math.PI * 2) / 3 + 0.12;
      inkStroke(paint, arc(R, t0, t0 + (Math.PI * 2) / 3 - 0.3), noise, { wid: K * 0.8, color: ink(0.5, [96, 96, 94]), noi: 0.7, salt: 50 + i });
    }
    // a thin wisp of cloud across it
    const wy = ay + R * 0.25;
    inkStroke(paint, Array.from({ length: 24 }, (_, j): [number, number] => [ax - R * 1.5 + (j / 23) * R * 3, wy + Math.sin(j * 0.5) * K * 0.8]), noise, {
      wid: K * 1.3,
      color: ink(0.16, [118, 124, 134]),
      noi: 0.6,
      salt: 60,
    });

    // copy onto the plane where nothing else (a far mountain) is painted; the disc claims the cells
    const { buf } = plane;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const c = tmp.px[y * bw + x];
        if (c >>> 24 === 0) continue;
        const gi = (y0 + y) * u.artW + (x0 + x);
        if (buf.own[gi] !== 0) continue;
        buf.blend(gi, c, tmp.own[y * bw + x] === 1 ? id : undefined);
      }
    }

    const cell = (v: number) => Math.floor(v);
    const { buf: planeBuf } = plane;
    const cells = rasterizeCoverage(bp, planeBuf, K, id, MOON, plane.grid, [cell(cx - r - 1), cell(cy - r - 1), cell(cx + r + 1), cell(cy + r + 1)], false);
    const info = bp.registry.strokes.get(id);
    if (!cells) bp.registry.strokes.delete(id);
    else if (info) info.bbox = cells;
  },
});
