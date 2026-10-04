import { cloudCapacity, type Cloud } from '../clouds';
import { registerLayer } from '../render';

/** Deterministic 0..1 from a cloud's seed and an index (shape only; rendering never touches world.rng). */
function rand(seed: number, k: number): number {
  let n = Math.imul(seed ^ (k * 0x9e3779b1), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/**
 * One cloud as an ink painter draws it: overlapping rounded puffs, back to front, each a paper-white
 * wash (greying as the cloud fills with water) edged with a fine grey line that the puffs in front
 * cover, so only the outer outline reads; a few light strokes under the flat base.
 */
function drawCloud(g: CanvasRenderingContext2D, c: Cloud, ox: number): void {
  const wet = Math.min(1, c.water / Math.max(1, cloudCapacity(c) * 0.5));
  const wash = [246 - 96 * wet, 243 - 92 * wet, 232 - 84 * wet].map(Math.round);
  const puff = (x: number, y: number, rx: number, ry: number, alpha: number) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fillStyle = `rgba(${wash[0]}, ${wash[1]}, ${wash[2]}, ${alpha})`;
    g.fill();
    g.strokeStyle = `rgba(100, 100, 100, ${0.45 - 0.15 * wet})`;
    g.lineWidth = 0.45;
    g.stroke();
  };
  const cx = c.x + ox;
  const lobes = 3 + Math.floor(rand(c.seed, 0) * 4);
  // the flat base: wide low puffs along the underside
  for (let k = 0; k < lobes + 1; k++) {
    const t = (k + 0.5) / (lobes + 1) - 0.5;
    puff(cx + t * c.hw * 1.7, c.y + c.hh * 0.25, c.hh * 1.5, c.hh * 0.6, 0.94);
  }
  // the lobes: bigger toward the middle, drawn left to right so each overlaps the last
  for (let k = 0; k < lobes; k++) {
    const t = (k + 0.5) / lobes;
    const r = c.hh * (0.75 + 0.75 * Math.sin(Math.PI * t)) * (0.85 + 0.3 * rand(c.seed, k + 1));
    puff(cx + (t - 0.5) * c.hw * 1.6, c.y - r * 0.3, r, r * 0.9, 0.96);
  }
  // light strokes under the base
  g.strokeStyle = `rgba(110, 110, 112, ${0.3 + 0.2 * wet})`;
  g.lineWidth = 0.35;
  for (let k = 0; k < 3; k++) {
    const y = c.y + c.hh * (0.95 + 0.3 * k);
    const half = c.hw * (0.9 - 0.25 * k) * (0.8 + 0.2 * rand(c.seed, 20 + k));
    g.beginPath();
    g.moveTo(cx - half, y);
    g.lineTo(cx + half, y);
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
