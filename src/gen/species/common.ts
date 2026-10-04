import { rgba } from '../../core/elements';
import { inkWash } from '../paint/shaders';
import { ink, inkStroke } from '../paint/strokes';
import type { GrowCtx } from './registry';

/** A filled foliage ellipse, darker toward its top edge, owned by the tree. */
export function blob(g: GrowCtx, cx: number, cy: number, rx: number, ry: number): void {
  const x0 = Math.floor(cx - rx);
  const n = Math.ceil(2 * rx) + 1;
  const tops = new Float32Array(n);
  const bots = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    const dx = (x0 + j + 0.5 - cx) / rx;
    const hh = dx * dx < 1 ? ry * Math.sqrt(1 - dx * dx) : 0;
    tops[j] = hh > 0 ? cy - hh : Infinity;
    bots[j] = hh > 0 ? cy + hh : -Infinity;
  }
  const shader = inkWash({ ink: g.ink, base: 0.45, edge: 0.4, edgeWidth: Math.max(1, ry * 0.4), speckle: 0.3, noise: g.noise, grain: 0.5 });
  g.paint.fillColumns(x0, tops, bots, shader, g.owner);
  // drawn, not flat: a fine broken ink line over the top of the crown and a few strokes inside it
  const arcAt = (f: number, t0: number, t1: number, n = 14): [number, number][] =>
    Array.from({ length: n }, (_, i): [number, number] => {
      const t = t0 + ((t1 - t0) * i) / (n - 1);
      return [cx + Math.cos(t) * rx * f, cy + Math.sin(t) * ry * f];
    });
  const a0 = Math.PI * (1.05 + 0.1 * g.rng.next());
  inkStroke(g.paint, arcAt(1, a0, a0 + Math.PI * 0.95), g.noise, { wid: Math.max(g.k * 0.4, ry * 0.07), color: ink(0.7, g.ink), noi: 0.6, salt: cx });
  const hatch = 3 + g.rng.int(4);
  for (let i = 0; i < hatch; i++) {
    const f = 0.35 + 0.5 * g.rng.next();
    const t = Math.PI * (0.15 + 0.7 * g.rng.next());
    inkStroke(g.paint, arcAt(f, t, t + 0.9), g.noise, { wid: Math.max(g.k * 0.3, ry * 0.045), color: ink(0.35, g.ink), noi: 0.5, salt: cx + i });
  }
}

/** An ink line owned by the tree (trunk, branch, needles). */
export function line(g: GrowCtx, pts: [number, number][], width: number, alpha = 230, taper = 0.4): void {
  const [r, gr, b] = g.ink;
  g.paint.stroke(pts, { width: Math.max(g.k * 0.35, width), color: rgba(r, gr, b, alpha), noise: 0.4, taper }, g.noise, g.owner);
}

/** Bbox of the pixels the tree owns, searched in a window around its foot. */
export function ownedBox(g: GrowCtx): [number, number, number, number] {
  const { own, w, h } = g.paint.buf;
  const xa = Math.max(0, Math.floor(g.x - g.size));
  const xb = Math.min(w - 1, Math.ceil(g.x + g.size));
  const ya = Math.max(0, Math.floor(g.y - g.size * 1.25));
  const yb = Math.min(h - 1, Math.ceil(g.y + g.size * 0.1));
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      if (own[y * w + x] !== g.owner) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x0 === Infinity ? [g.x, g.y, g.x, g.y] : [x0, y0, x1, y1];
}
