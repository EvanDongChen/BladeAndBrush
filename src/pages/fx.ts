/**
 * Hit feedback for the pages: blade trails, screen shake and hit-stop. Purely presentation: it
 * only listens to world events and never touches the World, so replays are unaffected. Hit-stop
 * just skips advancing the sim clock for a few frames.
 */
import type { World } from '../core/world';
import { lineColor, type Aim } from '../sim/lineAbility';
import '../sim/events';

export const fxSettings = {
  /** Frames a blade trail stays on screen. */
  trailFrames: 18,
  /** Largest shake offset in CSS pixels. */
  shakePx: 7,
  /** How quickly shake fades (trauma lost per second). */
  shakeDecay: 2.2,
  /** Cut cells in one frame that trigger hit-stop. */
  hitStopCuts: 150,
  /** Impact strength that triggers hit-stop. */
  hitStopImpact: 900,
  /** Frames after a hit-stop before another can start (a wide blade cuts 150+ cells on every tick of its sweep). */
  hitStopCooldown: 20,
  enabled: true,
};

interface Trail {
  aim: Aim;
  r: number;
  color: string;
  power: number;
  age: number;
}

export class Fx {
  private trails: Trail[] = [];
  private trauma = 0;
  private freeze = 0;
  private cooldown = 0;
  private cuts = 0;
  private unsubs: (() => void)[] = [];

  /** Listen to a world's events (call again whenever the page swaps in a new world). */
  attach(world: World): void {
    this.detach();
    this.unsubs.push(
      world.events.on('lineFire', (e) => {
        if (!fxSettings.enabled) return;
        this.trails.push({ aim: e, r: e.r, color: lineColor(e.id), power: e.power, age: 0 });
        this.trauma = Math.min(1, this.trauma + 0.12 * e.power);
      }),
      world.events.on('cut', () => this.cuts++),
      world.events.on('impact', (e) => {
        if (!fxSettings.enabled) return;
        this.trauma = Math.min(1, this.trauma + Math.min(0.6, e.strength / 1500));
        if (e.strength >= fxSettings.hitStopImpact) this.hitStop(2);
      }),
    );
  }

  detach(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }

  /** Hold the sim for `frames`, once per cooldown: one beat at the start of a big cut, not a stutter all through it. */
  private hitStop(frames: number): void {
    if (this.cooldown > 0) return;
    this.freeze = Math.max(this.freeze, frames);
    this.cooldown = frames + fxSettings.hitStopCooldown;
  }

  /** Ask before advancing the sim each frame: false while a hit-stop holds. */
  shouldAdvance(): boolean {
    if (this.freeze > 0) {
      this.freeze--;
      return false;
    }
    return true;
  }

  /** Call once per frame after the sim advanced: turns this frame's cuts into hit-stop and shake. */
  endFrame(canvas: HTMLElement, dtMs: number): void {
    if (fxSettings.enabled && this.cuts > 0) {
      this.trauma = Math.min(1, this.trauma + Math.min(0.5, this.cuts / 1200));
      if (this.cuts >= fxSettings.hitStopCuts) this.hitStop(2 + Math.min(2, Math.floor(this.cuts / 400)));
    }
    this.cuts = 0;
    if (this.cooldown > 0) this.cooldown--;

    this.trauma = Math.max(0, this.trauma - (fxSettings.shakeDecay * dtMs) / 1000);
    const amp = fxSettings.shakePx * this.trauma * this.trauma;
    canvas.style.transform =
      amp > 0.05 ? `translate(${((Math.random() * 2 - 1) * amp).toFixed(2)}px, ${((Math.random() * 2 - 1) * amp).toFixed(2)}px)` : '';
  }

  /** Draw blade trails on the grid-resolution canvas (after the world is rendered). */
  draw(g: CanvasRenderingContext2D): void {
    let keep = 0;
    for (const t of this.trails) {
      const life = Math.pow(1 - t.age / fxSettings.trailFrames, 0.5); // stays strong, then fades fast
      if (life > 0) {
        drawTrail(g, t, life);
        t.age++;
        this.trails[keep++] = t;
      }
    }
    this.trails.length = keep;
  }
}

/**
 * A blade sweep along the line: a thin crescent that is a hairline at the start, swells toward
 * the end and finishes in a sharp tip. One edge stays straight (the edge of the blade) while the
 * other bows out, so even a wide, short slash reads as a cut rather than an almond. The trail
 * wipes away from its tail as it fades, and its width is capped by its length.
 */
function drawTrail(g: CanvasRenderingContext2D, t: Trail, life: number): void {
  const { x0, y0, x1, y1 } = t.aim;
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1) return;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const nx = -uy;
  const ny = ux;
  const steps = 28;
  // width: grows with the brush and the charge, but never wider than a sliver of the line's length
  const width = Math.min(Math.max(1.5, t.r * 0.8) * (0.6 + 0.4 * t.power), len * 0.11) * (0.55 + 0.45 * life);
  const tail = 1 - life; // the tail end retracts toward the tip as the trail fades
  const profile = (s: number) => Math.pow(s, 1.6) * Math.pow(1 - s, 0.28) * 1.55; // peaks near the tip
  const edge = (k: number, out: number, side: number) => {
    const s = tail + (1 - tail) * (k / steps);
    const w = width * profile(s);
    const bow = width * 0.35 * Math.sin(Math.PI * s); // the whole sweep arcs slightly
    const off = bow + side * w * out;
    return [x0 + ux * len * s + nx * off, y0 + uy * len * s + ny * off];
  };
  const crescent = (outer: number, inner: number) => {
    g.beginPath();
    for (let k = 0; k <= steps; k++) g.lineTo(...(edge(k, outer, 1) as [number, number]));
    for (let k = steps; k >= 0; k--) g.lineTo(...(edge(k, inner, -1) as [number, number]));
    g.closePath();
    g.fill();
  };
  g.save();
  // a soft wash of the blade's color, then the sharp body, then a bright glint on the cutting edge
  g.fillStyle = `rgba(${t.color}, ${0.28 * life})`;
  crescent(1.5, 0.5);
  g.fillStyle = `rgba(${t.color}, ${0.75 * life})`;
  crescent(1, 0.12);
  g.fillStyle = `rgba(255, 248, 236, ${0.85 * life})`;
  crescent(0.32, -0.12);
  // a few thin speed lines trailing behind the cutting edge
  g.strokeStyle = `rgba(${t.color}, ${0.45 * life})`;
  g.lineWidth = Math.max(0.6, width * 0.08);
  g.lineCap = 'round';
  for (const [at, out] of [
    [0.45, 1.25],
    [0.6, 1.7],
    [0.3, 0.9],
  ]) {
    const s0 = Math.max(tail, at - 0.25);
    const s1 = at + 0.25;
    if (s1 <= s0) continue;
    const p0 = edge(((s0 - tail) / (1 - tail || 1)) * steps, out, 1);
    const p1 = edge(((s1 - tail) / (1 - tail || 1)) * steps, out, 1);
    g.beginPath();
    g.moveTo(p0[0], p0[1]);
    g.lineTo(p1[0], p1[1]);
    g.stroke();
  }
  g.restore();
}
