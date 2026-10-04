/**
 * First-person sword for line abilities. This is the light wrapper: it listens for `lineFire`,
 * skips everything under reduced motion, and loads the three.js sword (`swordGl.ts`) lazily so the
 * rest of the page does not wait for it. Presentation only: it never touches the World, so replays
 * are unaffected.
 */
import type { World } from '../core/world';
import '../sim/events';
import type { SwordStage } from './swordGl';

export class SlashFx {
  private stage: SwordStage | null = null;
  private loading = false;
  private unsub: (() => void) | null = null;
  private readonly enabled: boolean;

  /** `layer` overlays the frame; `cellsWide` is the grid width the canvas shows. */
  constructor(
    private readonly layer: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly cellsWide: number,
  ) {
    this.enabled = !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (this.enabled) setTimeout(() => this.load(), 0);
  }

  private load(): void {
    if (this.loading || !this.enabled) return;
    this.loading = true;
    void import('./swordGl').then((m) => {
      this.stage = new m.SwordStage(this.layer, this.canvas, this.cellsWide);
    });
  }

  /** Listen to a world's events (call again whenever the page swaps in a new world). */
  attach(world: World): void {
    this.unsub?.();
    this.stage?.cancel();
    this.unsub = world.events.on('lineFire', (e) => this.stage?.fire(e.id, e.x0, e.y0, e.x1, e.y1));
  }

  /** While aiming: the pointer is held and the aimed line runs (x0, y0) to (x1, y1) in grid cells. */
  aim(id: string, x0: number, y0: number, x1: number, y1: number): void {
    this.stage?.aim(id, x0, y0, x1, y1);
  }

  /** The pointer was released. */
  release(): void {
    this.stage?.release();
  }

  dispose(): void {
    this.unsub?.();
    this.unsub = null;
    this.stage?.dispose();
    this.stage = null;
  }
}
