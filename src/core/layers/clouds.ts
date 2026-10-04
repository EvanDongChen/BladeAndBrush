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
  r: number;
}

/** The cloud's billows: a few big lobes along the top, smaller ones along a flat base. */
function lobesOf(c: Cloud, cx: number): Lobe[] {
  const out: Lobe[] = [];
  // enough lobes to overlap along the width, so a wide cloud is one billowing mass, not separate blobs
  const n = Math.max(3, Math.min(8, Math.round((c.hw * 1.55) / (c.hh * 1.25)) + Math.floor(rand(c.seed, 0) * 2)));
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const r = c.hh * (0.85 + 0.6 * Math.sin(Math.PI * t)) * (0.9 + 0.25 * rand(c.seed, k + 1));
    out.push({ x: cx + (t - 0.5) * c.hw * 1.55, y: c.y + c.hh * 0.35 - r * 0.85, r });
  }
  const m = n + 2;
  for (let k = 0; k < m; k++) {
    const t = (k + 0.5) / m;
    const r = c.hh * (0.38 + 0.22 * rand(c.seed, 30 + k));
    out.push({ x: cx + (t - 0.5) * c.hw * 1.95, y: c.y + c.hh * 0.45 - r * 0.75, r });
  }
  return out;
}

/**
 * One cloud as an ink painter draws it (like a brush drawing of billowing cumulus): big rounded
 * lobes joined into one scalloped silhouette, an ink outline of varying weight along the OUTSIDE of
 * the lobes only (where they overlap there is no line, just a cusp), soft grey wash layered under
 * the lobes, and a few ragged strokes trailing out along the flat base. Greys as it fills with water.
 */
function drawCloud(g: CanvasRenderingContext2D, c: Cloud, ox: number): void {
  const wet = Math.min(1, c.water / Math.max(1, cloudCapacity(c) * 0.5));
  const cx = c.x + ox;
  const lobes = lobesOf(c, cx);
  const baseY = c.y + c.hh * 0.45;
  const paper = [248 - 80 * wet, 245 - 78 * wet, 234 - 70 * wet].map(Math.round);

  // the silhouette: every lobe, filled as one shape
  g.save();
  g.beginPath();
  for (const l of lobes) {
    g.moveTo(l.x + l.r, l.y);
    g.arc(l.x, l.y, l.r, 0, Math.PI * 2);
  }
  g.fillStyle = `rgba(${paper[0]}, ${paper[1]}, ${paper[2]}, 0.97)`;
  g.fill();
  // soft grey wash, layered (alpha stacks where lobes overlap), kept inside the silhouette
  g.clip();
  for (const l of lobes) {
    g.beginPath();
    g.ellipse(l.x + l.r * 0.18, l.y + l.r * 0.42, l.r * 0.95, l.r * 0.6, 0, 0, Math.PI * 2);
    g.fillStyle = `rgba(112, 116, 126, ${0.08 + 0.07 * wet})`;
    g.fill();
  }
  g.beginPath();
  g.ellipse(cx, baseY, c.hw * 0.95, c.hh * 0.5, 0, 0, Math.PI * 2);
  g.fillStyle = `rgba(112, 116, 126, ${0.1 + 0.08 * wet})`;
  g.fill();
  g.restore();

  // the outline: only the arcs of each lobe that are not inside another, and not the underside
  g.lineCap = 'round';
  g.strokeStyle = `rgba(52, 52, 56, ${0.85 - 0.15 * wet})`;
  let seg = 0;
  for (let li = 0; li < lobes.length; li++) {
    const l = lobes[li];
    let prev: [number, number] | null = null;
    for (let a = 0; a <= Math.PI * 2 + 0.001; a += 0.14) {
      const x = l.x + Math.cos(a) * l.r;
      const y = l.y + Math.sin(a) * l.r;
      const inside = lobes.some((o, oi) => oi !== li && (x - o.x) ** 2 + (y - o.y) ** 2 < (o.r * 0.97) ** 2);
      if (inside || y > baseY - c.hh * 0.05) {
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

  // ragged strokes along the flat base, trailing out past the ends
  g.strokeStyle = `rgba(70, 70, 76, ${0.5 + 0.2 * wet})`;
  for (let k = 0; k < 4; k++) {
    const dir = k % 2 === 0 ? -1 : 1;
    const x0 = cx + dir * c.hw * (0.2 + 0.2 * rand(c.seed, 60 + k));
    const x1 = cx + dir * c.hw * (1.0 + 0.3 * rand(c.seed, 70 + k));
    const y = baseY + c.hh * (0.05 + 0.12 * k);
    g.lineWidth = 0.3 + 0.2 * rand(c.seed, 80 + k);
    g.beginPath();
    g.moveTo(x0, y);
    g.quadraticCurveTo((x0 + x1) / 2, y + c.hh * 0.12 * dir, x1, y - c.hh * 0.05);
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
