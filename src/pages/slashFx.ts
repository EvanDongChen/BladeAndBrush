/**
 * First-person sword swing: when a line ability is released, a big shaded sword sweeps across the
 * painting along the aimed line, as if swung from the player's seat in front of the screen. It grows
 * toward the camera mid-swing and turns its edge through the arc with CSS 3D. Presentation only: it
 * listens to the `lineFire` event and never touches the World, so replays are unaffected.
 */
import type { World } from '../core/world';
import '../sim/events';
import { swordSvg } from './swords';

const SWING_MS = 420;

export class SlashFx {
  private unsub: (() => void) | null = null;

  /** `layer` overlays the canvas exactly; `cellsWide` is the grid width the canvas shows. */
  constructor(
    private readonly layer: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly cellsWide: number,
  ) {}

  /** Listen to a world's events (call again whenever the page swaps in a new world). */
  attach(world: World): void {
    this.detach();
    this.unsub = world.events.on('lineFire', (e) => this.swing(e.id, e.x0, e.y0, e.x1, e.y1, e.power));
  }

  detach(): void {
    this.unsub?.();
    this.unsub = null;
    this.layer.replaceChildren();
  }

  private swing(id: string, x0: number, y0: number, x1: number, y1: number, power: number): void {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const k = this.canvas.clientWidth / this.cellsWide;
    const ox = this.canvas.clientLeft;
    const oy = this.canvas.clientTop;
    const sx = ox + x0 * k;
    const sy = oy + y0 * k;
    const ex = ox + x1 * k;
    const ey = oy + y1 * k;
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    const deg = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
    const big = 1 + 0.25 * (power - 1);

    const el = document.createElement('div');
    el.className = 'slash-sword';
    el.style.height = `${this.canvas.clientHeight * 1.05}px`;
    el.innerHTML = swordSvg(id);
    this.layer.append(el);

    // blade held across the line of travel; its edge turns toward us through the swing
    const at = (x: number, y: number, z: number, ry: number, s: number) =>
      `translate(${x}px, ${y}px) translate(-50%, -50%) perspective(640px) rotateZ(${deg + z}deg) rotateX(28deg) rotateY(${ry}deg) scale(${s})`;
    const anim = el.animate(
      [
        { transform: at(sx, sy, -32, 62, 0.55 * big), opacity: 0 },
        { transform: at(sx + (mx - sx) * 0.3, sy + (my - sy) * 0.3, -18, 40, 0.9 * big), opacity: 1, offset: 0.2 },
        { transform: at(mx, my, 0, 0, 1.3 * big), opacity: 1, offset: 0.55 },
        { transform: at(ex, ey, 22, -44, 1 * big), opacity: 1, offset: 0.85 },
        { transform: at(ex + (ex - mx) * 0.2, ey + (ey - my) * 0.2, 30, -62, 0.8 * big), opacity: 0 },
      ],
      { duration: SWING_MS, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' },
    );
    anim.onfinish = () => el.remove();
  }
}
