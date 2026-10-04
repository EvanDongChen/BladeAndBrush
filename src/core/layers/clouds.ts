import { cloudCapacity, type Cloud } from '../clouds';
import { registerLayer } from '../render';

/** Deterministic 0..1 from a cloud's seed and an index (shape only; rendering never touches world.rng). */
function rand(seed: number, k: number): number {
  let n = Math.imul(seed ^ (k * 0x9e3779b1), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** One cloud as soft overlapping puffs: a flat base and a row of round lobes on top. */
function drawCloud(g: CanvasRenderingContext2D, c: Cloud, ox: number): void {
  const wet = Math.min(1, c.water / Math.max(1, cloudCapacity(c) * 0.5));
  const lit = [250 - 110 * wet, 248 - 106 * wet, 242 - 98 * wet].map(Math.round);
  const shade = [214 - 120 * wet, 214 - 116 * wet, 212 - 108 * wet].map(Math.round);
  const puff = (x: number, y: number, r: number, alpha: number) => {
    const grad = g.createRadialGradient(x, y - r * 0.25, r * 0.1, x, y, r);
    grad.addColorStop(0, `rgba(${lit[0]}, ${lit[1]}, ${lit[2]}, ${alpha})`);
    grad.addColorStop(0.6, `rgba(${shade[0]}, ${shade[1]}, ${shade[2]}, ${alpha * 0.75})`);
    grad.addColorStop(1, `rgba(${shade[0]}, ${shade[1]}, ${shade[2]}, 0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  const cx = c.x + ox;
  const lobes = 3 + Math.floor(rand(c.seed, 0) * 4);
  // the base: a few wide flat puffs along the underside
  for (let k = 0; k < lobes + 1; k++) {
    const t = (k + 0.5) / (lobes + 1) - 0.5;
    g.save();
    g.translate(cx + t * c.hw * 1.7, c.y + c.hh * 0.15);
    g.scale(1, 0.45);
    puff(0, 0, c.hh * 1.9, 0.55);
    g.restore();
  }
  // the lobes: bigger toward the middle
  for (let k = 0; k < lobes; k++) {
    const t = (k + 0.5) / lobes;
    const r = c.hh * (0.75 + 0.75 * Math.sin(Math.PI * t)) * (0.85 + 0.3 * rand(c.seed, k + 1));
    puff(cx + (t - 0.5) * c.hw * 1.6, c.y - r * 0.35, r, 0.7);
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
