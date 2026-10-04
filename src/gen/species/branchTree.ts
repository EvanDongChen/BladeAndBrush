import { rgba } from '../../core/elements';
import { blob, ink, inkStroke } from '../paint/strokes';
import { ownedBox } from './common';
import { registerSpecies, type GrowCtx } from './registry';

const PAPER = rgba(241, 235, 220);

/** A limb as a polygon: a centreline pushed out to both sides by a tapering half-width. */
function limb(g: GrowCtx, line: [number, number][], w0: number): [number, number][] {
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const w = w0 * ((1 - i / line.length) * 0.55 + 0.45) * (0.85 + 0.3 * g.noise.n2(i * 0.3, w0));
    left.push([line[i][0] - dy * w, line[i][1] + dx * w]);
    right.push([line[i][0] + dy * w, line[i][1] - dx * w]);
  }
  return left.concat(right.reverse());
}

/** A bent path from (x, y): `segs` segments of total length `len`, starting at angle `ang`, bending by up to `bend`. */
function path(g: GrowCtx, x: number, y: number, len: number, ang: number, bend: number, segs = 3, det = 6): [number, number][] {
  const pts: [number, number][] = [[x, y]];
  let a = ang;
  let px = x;
  let py = y;
  for (let s = 0; s < segs; s++) {
    a += g.rng.range(0.5, 1) * bend * (g.rng.chance(0.5) ? -1 : 1);
    const nx = px + (Math.cos(a) * len) / segs;
    const ny = py + (Math.sin(a) * len) / segs;
    for (let d = 1; d <= det; d++) pts.push([px + ((nx - px) * d) / det, py + ((ny - py) * d) / det]);
    px = nx;
    py = ny;
  }
  return pts;
}

/** A spray of leaf dabs at a twig end. */
function leaves(g: GrowCtx, x: number, y: number, s: number, ang: number): void {
  for (let j = 0; j < 5; j++) {
    const d = (j - 2) * s * 0.18;
    blob(g.paint, x + Math.cos(ang) * d, y + Math.sin(ang) * d - s * 0.08, g.noise, {
      len: s * g.rng.range(0.28, 0.45),
      wid: s * g.rng.range(0.1, 0.16),
      ang: ang + Math.PI / 2 + (g.rng.next() - 0.5) * 0.6,
      color: ink(g.rng.range(0.45, 0.7), g.ink),
      noi: 0.5,
      point: 0.9,
      owner: g.owner,
      salt: x * 0.01 + j,
    });
  }
}

/**
 * A big branching tree for the foreground plateaus: a bent paper-white trunk with an ink outline
 * and bark marks, a few branches off its upper half, and twigs ending in sprays of leaf dabs.
 */
registerSpecies({
  name: 'branchTree',
  grow: (g) => {
    const { x, y, size, rng, noise } = g;
    const wid = Math.max(g.k * 1.6, size * 0.034);
    const trunk = path(g, x, y, size, -Math.PI / 2, Math.PI * 0.12, 3, 8);
    const outline = (poly: [number, number][]) => {
      g.paint.fillPolygon(poly, PAPER, g.owner);
      inkStroke(g.paint, poly.concat([poly[0]]), noise, { wid: g.k * 0.5, color: ink(0.45, g.ink), noi: 0.8, widthFn: () => 1, salt: poly.length });
    };
    const twigEnds: [number, number, number][] = [];
    const branches = 2 + rng.int(3);
    for (let b = 0; b < branches; b++) {
      const at = trunk[Math.floor(trunk.length * rng.range(0.4, 0.85))];
      const side = b % 2 === 0 ? -1 : 1;
      const ang = -Math.PI / 2 + side * rng.range(0.6, 1.2);
      const br = path(g, at[0], at[1], size * rng.range(0.25, 0.45), ang, Math.PI * 0.15, 2, 6);
      outline(limb(g, br, wid * 0.5));
      const end = br[br.length - 1];
      twigEnds.push([end[0], end[1], ang]);
      const mid = br[Math.floor(br.length / 2)];
      twigEnds.push([mid[0], mid[1] - size * 0.03, ang - side * 0.4]);
    }
    outline(limb(g, trunk, wid));
    // bark: short marks along the trunk
    for (let i = 2; i < trunk.length - 1; i += 2) {
      const [tx, ty] = trunk[i];
      inkStroke(g.paint, [[tx - wid * 0.3, ty], [tx + wid * 0.2, ty - wid * 0.6]], noise, { wid: g.k * 0.4, color: ink(0.35, g.ink), noi: 0.5, salt: i });
    }
    const top = trunk[trunk.length - 1];
    twigEnds.push([top[0], top[1], -Math.PI / 2]);
    for (const [tx, ty, ang] of twigEnds) {
      const tw = path(g, tx, ty, size * 0.12, ang - Math.PI / 6, 0.3, 2, 4);
      inkStroke(g.paint, tw, noise, { wid: g.k * 0.45, color: ink(0.5, g.ink), noi: 0.4, salt: tx });
      leaves(g, tw[tw.length - 1][0], tw[tw.length - 1][1], size * 0.22, ang);
    }
    return ownedBox(g);
  },
});
