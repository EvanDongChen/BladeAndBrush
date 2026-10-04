/**
 * The home page's living landscape: a real painting from the generator that draws itself left to
 * right, with clouds drifting and birds crossing the sky, and a blade the visitor can drag across
 * it. Presentation only; it runs the same sim as the levels.
 *
 * It waits until the page has painted before generating (a hand-drawn placeholder shows until
 * then), stops stepping while off screen, and stays still for visitors who prefer reduced motion.
 */
import { artView, type Blueprint } from '../core/blueprint';
import { Clock } from '../core/clock';
import { DEFAULT_DIMS } from '../core/constants';
import { defaultParams } from '../core/params';
import { Renderer } from '../core/render';
import { ActionDriver } from '../core/replay';
import { World } from '../core/world';
import { Frontier } from '../gen/frontier';
import { generate } from '../gen/generate';
import { aimEnd, chargeOf, drawAim } from '../sim/lineAbility';
import { step } from '../sim/step';
import { Fx } from './fx';
import { h, startLoop, toCell } from './ui';

/** Seeds that paint well as a title piece. One is picked per visit; Repaint walks through them. */
const SEEDS = [7, 21, 42, 108, 233, 512, 777, 1024];
/** Art pixels per cell for the hero: sharp enough full-width, cheap enough to generate on load. */
const ART_K = 2;

export interface HeroScene {
  node: HTMLElement;
  /** Paint a new landscape (next seed). */
  repaint(): void;
  destroy(): void;
}

export function heroScene(placeholder: Node): HeroScene {
  const dims = DEFAULT_DIMS;
  const canvas = h('canvas', { class: 'hero-canvas', role: 'img', 'aria-label': 'A shan shui landscape painting itself, with drifting clouds and birds' });
  const node = h('div', { class: 'hero-scene' }, h('div', { class: 'hero-placeholder', 'aria-hidden': 'true' }, placeholder), canvas);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = { ...defaultParams(), mountainHeight: 0.62, spacing: 0.45, cloudiness: 0.65, wildlife: 0.7, wanderers: 0.35, wind: 0.4 };
  const fx = new Fx();
  let seedIndex = Math.floor(Math.random() * SEEDS.length);

  let renderer: Renderer | null = null;
  let bp: Blueprint | null = null;
  let world: World | null = null;
  let frontier: Frontier | null = null;
  let driver = new ActionDriver();

  const clock = new Clock(() => {
    if (!world || !frontier) return;
    driver.apply(world);
    frontier.advance(world, 6);
    step(world);
  });

  function paint(): void {
    renderer ??= new Renderer(canvas, dims, ART_K);
    bp = generate(SEEDS[seedIndex % SEEDS.length], params, { k: ART_K });
    world = new World(dims, SEEDS[seedIndex % SEEDS.length], { ...params });
    frontier = new Frontier(bp, 6);
    driver = new ActionDriver();
    fx.attach(world);
    clock.reset();
    if (reduced) {
      frontier.revealAll(world); // no reveal animation: the finished painting, still
      for (let t = 0; t < 30; t++) step(world);
    }
    node.classList.add('ready');
  }

  // ---- the blade: drag across the painting to cut it ----
  let down = false;
  let from = { x: 0, y: 0 };
  let at = { x: 0, y: 0 };
  let pressed = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (!world || !frontier?.done || reduced) return;
    canvas.setPointerCapture?.(e.pointerId);
    from = at = toCell(canvas, e);
    from = at = { x: at.x / ART_K, y: at.y / ART_K };
    down = true;
    pressed = world.tick;
    driver.begin('slash', { ...from, speed: 0 }, { radius: 3 });
    node.classList.add('cutting');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down) return;
    const p = toCell(canvas, e);
    at = { x: p.x / ART_K, y: p.y / ART_K };
    driver.move({ ...at, speed: 6 });
  });
  const release = () => {
    if (!down) return;
    down = false;
    driver.end();
    node.classList.remove('cutting');
    node.classList.add('cut-once');
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // ---- run only while on screen ----
  let visible = true;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.05 });
  io.observe(node);
  clock.paused = reduced;

  const stop = startLoop(
    clock,
    (dt) => {
      if (!renderer || !world || !frontier || !bp) return;
      renderer.draw(world, { frontierX: frontier.done ? undefined : frontier.x, art: artView(bp) });
      const g = renderer.g;
      g.setTransform(ART_K, 0, 0, ART_K, 0, 0); // trails and the aim are drawn in cells
      fx.draw(g);
      if (down) drawAim(g, 'slash', aimEnd(from.x, from.y, at.x, at.y), 3, chargeOf(world.tick - pressed));
      g.setTransform(1, 0, 0, 1, 0, 0);
      fx.endFrame(canvas, dt);
    },
    () => visible && !document.hidden && fx.shouldAdvance(),
  );

  // generate once the page has painted, so the title shows at once
  const start = window.setTimeout(() => requestAnimationFrame(paint), 60);

  return {
    node,
    repaint: () => {
      seedIndex++;
      node.classList.remove('ready', 'cut-once');
      window.setTimeout(paint, 380); // let the old painting fade first
    },
    destroy: () => {
      clearTimeout(start);
      stop();
      io.disconnect();
      fx.detach();
    },
  };
}
