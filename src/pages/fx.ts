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

/** A tapered streak along the line: fat in the middle, sharp at both ends, an ink core with a colored edge. */
function drawTrail(g: CanvasRenderingContext2D, t: Trail, life: number): void {
  const { x0, y0, x1, y1 } = t.aim;
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1) return;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const nx = -uy;
  const ny = ux;
  const steps = 16;
  const shape = (width: number) => {
    g.beginPath();
    for (let k = 0; k <= steps; k++) {
      const s = k / steps;
      const w = width * Math.pow(Math.sin(Math.PI * s), 0.7);
      g.lineTo(x0 + ux * len * s + nx * w, y0 + uy * len * s + ny * w);
    }
    for (let k = steps; k >= 0; k--) {
      const s = k / steps;
      const w = width * Math.pow(Math.sin(Math.PI * s), 0.7);
      g.lineTo(x0 + ux * len * s - nx * w, y0 + uy * len * s - ny * w);
    }
    g.closePath();
    g.fill();
  };
  const width = Math.max(1.5, t.r * 0.9) * (0.6 + 0.4 * t.power) * (0.5 + 0.5 * life);
  g.save();
  g.fillStyle = `rgba(${t.color}, ${0.55 * life})`;
  shape(width * 1.6);
  g.fillStyle = `rgba(24, 20, 18, ${0.85 * life})`; // ink, so it reads on the paper
  shape(width * 0.5);
  g.restore();
}
