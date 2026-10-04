import { cloudCapacity, type Cloud } from '../clouds';
import { registerLayer } from '../render';

/** Deterministic 0..1 from a cloud's seed and an index (shape only; rendering never touches world.rng). */
function rand(seed: number, k: number): number {
  let n = Math.imul(seed ^ (k * 0x9e3779b1), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

interface Lobe {
  x: number;
  y: number;
  /** Half width and half height: wide, low lobes on a long cloud, so they always overlap into one mass. */
  rx: number;
  ry: number;
}

/**
 * The cloud's billows: one row of big lobes, each as wide as the gap between lobe centres needs (so
 * neighbours overlap however long the cloud is) and as tall as the cloud's height gives. There is no
 * second row of small lobes underneath: a row of them read as a row of separate circles hanging off
 * the bottom. The underside is a flat line instead, which `baseOf` and `drawCloud` add.
 */
export function lobesOf(c: Cloud, cx: number): Lobe[] {
  const out: Lobe[] = [];
  const n = Math.max(3, Math.min(14, Math.round((c.hw * 1.55) / (c.hh * 1.1)) + Math.floor(rand(c.seed, 0) * 2)));
  const gap = (c.hw * 1.55) / n;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const ry = c.hh * (0.85 + 0.6 * Math.sin(Math.PI * t)) * (0.9 + 0.25 * rand(c.seed, k + 1));
    const rx = Math.max(ry * 0.9, gap * 0.78 * (0.9 + 0.25 * rand(c.seed, 40 + k)));
    out.push({ x: cx + (t - 0.5) * c.hw * 1.55, y: c.y + c.hh * 0.35 - ry * 0.85, rx, ry });
  }
  return out;
}

/**
 * Where the cloud stops billowing and starts being flat: a base line just above the lowest billow,
 * and the width of the cloud where it cuts. `top` is a bound for filling down from. An ink painter
 * closes a cumulus with one line along the bottom, not with more lobes.
 */
function baseOf(c: Cloud, cx: number, lobes: Lobe[]): { y: number; x0: number; x1: number; top: number } {
  let high = Infinity;
  let low = -Infinity;
  for (const l of lobes) {
    if (l.y - l.ry < high) high = l.y - l.ry;
    if (l.y + l.ry > low) low = l.y + l.ry;
  }
  const y = low - (low - high) * 0.12;
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const l of lobes) {
    const d = (y - l.y) / l.ry; // where the base line crosses this lobe, if it does
    if (d <= -1 || d >= 1) continue;
    const half = l.rx * Math.sqrt(1 - d * d);
    if (l.x - half < x0) x0 = l.x - half;
    if (l.x + half > x1) x1 = l.x + half;
  }
  if (!Number.isFinite(x0) || !Number.isFinite(x1)) return { y, x0: cx - c.hw, x1: cx + c.hw, top: high - c.hh };
  return { y, x0, x1, top: high - c.hh };
}

/**
 * One cloud as an ink painter draws it (like a brush drawing of billowing cumulus): big rounded
 * lobes joined into one scalloped silhouette that is cut off flat along a base line, an ink outline
 * of varying weight along the OUTSIDE of the lobes only (where they overlap there is no line, just a
 * cusp), the base itself drawn as a line rather than left as lobes, soft grey wash layered under it,
 * and a few thin lines trailing out past the ends. Greys as it fills with water.
 */
function drawCloud(g: CanvasRenderingContext2D, c: Cloud, ox: number): void {
  const wet = Math.min(1, c.water / Math.max(1, cloudCapacity(c) * 0.5));
  const cx = c.x + ox;
  const lobes = lobesOf(c, cx);
  const base = baseOf(c, cx, lobes);
  const paper = [248 - 80 * wet, 245 - 78 * wet, 234 - 70 * wet].map(Math.round);

  // the silhouette: the lobes as one shape, trimmed flat along the base line so nothing hangs below it
  g.save();
  g.beginPath();
  for (const l of lobes) {
    g.moveTo(l.x + l.rx, l.y);
    g.ellipse(l.x, l.y, l.rx, l.ry, 0, 0, Math.PI * 2);
  }
  g.clip(); // both the paper and the wash stop at the lobes, and at the base line
  g.fillStyle = `rgba(${paper[0]}, ${paper[1]}, ${paper[2]}, 0.97)`;
  g.fillRect(base.x0 - c.hw, base.top, base.x1 - base.x0 + 2 * c.hw, base.y - base.top);
  // soft grey wash, layered (alpha stacks where lobes overlap), kept inside the silhouette
  for (const l of lobes) {
    g.beginPath();
    g.ellipse(l.x + l.rx * 0.12, l.y + l.ry * 0.42, l.rx * 0.95, l.ry * 0.6, 0, 0, Math.PI * 2);
    g.fillStyle = `rgba(112, 116, 126, ${0.08 + 0.07 * wet})`;
    g.fill();
  }
  g.beginPath();
  g.ellipse(cx, base.y - c.hh * 0.15, (base.x1 - base.x0) * 0.5, c.hh * 0.6, 0, 0, Math.PI * 2);
  g.fillStyle = `rgba(112, 116, 126, ${0.1 + 0.08 * wet})`;
  g.fill();
  g.restore();

  // the outline: only the arcs of each lobe that are not inside another, and none under the base line
  g.lineCap = 'round';
  g.strokeStyle = `rgba(52, 52, 56, ${0.85 - 0.15 * wet})`;
  let seg = 0;
  for (let li = 0; li < lobes.length; li++) {
    const l = lobes[li];
    let prev: [number, number] | null = null;
    for (let a = 0; a <= Math.PI * 2 + 0.001; a += 0.14) {
      const x = l.x + Math.cos(a) * l.rx;
      const y = l.y + Math.sin(a) * l.ry;
      const inside = lobes.some((o, oi) => oi !== li && ((x - o.x) / o.rx) ** 2 + ((y - o.y) / o.ry) ** 2 < 0.94);
      if (inside || y > base.y) {
        prev = null;
        continue;
      }
      if (prev) {
        g.lineWidth = 0.35 + 0.5 * rand(c.seed, 100 + seg++);
        g.beginPath();
        g.moveTo(prev[0], prev[1]);
        g.lineTo(x, y);
        g.stroke();
      }
      prev = [x, y];
    }
  }

  // the base: the bottom is drawn, not left as lobes. A ragged line closes the billows off, and
  // thinner lines carry on past each end.
  const span = base.x1 - base.x0;
  for (let s = 0; s < 6; s++) {
    g.lineWidth = 0.35 + 0.45 * rand(c.seed, 140 + s);
    g.beginPath();
    g.moveTo(base.x0 + (span * s) / 6, base.y + c.hh * 0.04 * (rand(c.seed, 160 + s) - 0.5));
    g.lineTo(base.x0 + (span * (s + 1)) / 6, base.y + c.hh * 0.04 * (rand(c.seed, 170 + s) - 0.5));
    g.stroke();
  }
  g.strokeStyle = `rgba(70, 70, 76, ${0.5 + 0.2 * wet})`;
  for (let k = 0; k < 3; k++) {
    const dir = k % 2 === 0 ? -1 : 1;
    const x0 = dir < 0 ? base.x0 : base.x1;
    const y = base.y + c.hh * (0.03 + 0.11 * k);
    g.lineWidth = 0.25 + 0.2 * rand(c.seed, 80 + k);
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x0 + dir * c.hw * (0.2 + 0.35 * rand(c.seed, 60 + k)), y - c.hh * 0.04);
    g.stroke();
  }
}

/**
 * Clouds (core/clouds.ts) as soft puffs drifting over the painting: over the art, under the glow.
 * Clouds near an edge are also drawn wrapped round to the other side, as they drift across.
 */
registerLayer({
  name: 'clouds',
  label: 'Clouds',
  order: 22,
  kind: 'canvas',
  draw: ({ g, world }) => {
    if (world.clouds.length === 0) return;
    g.save();
    for (const c of world.clouds) {
      drawCloud(g, c, 0);
      if (c.x - c.hw < 0) drawCloud(g, c, world.w);
      if (c.x + c.hw > world.w) drawCloud(g, c, -world.w);
    }
    g.restore();
  },
});
