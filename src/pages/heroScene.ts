/**
 * The home page's living landscape: a real painting from the generator that draws itself left to
 * right, with clouds drifting and birds crossing the sky. Presentation only (no input); it runs the
 * same sim as the levels.
 *
 * It waits until the page has painted before generating (the paper stays blank until then, and the
 * painting fades in), stops stepping while off screen, and stays still for visitors who prefer
 * reduced motion.
 */
import { artView, type Blueprint } from '../core/blueprint';
import { Clock } from '../core/clock';
import { DEFAULT_DIMS } from '../core/constants';
import { defaultParams } from '../core/params';
import { Renderer } from '../core/render';
import { World } from '../core/world';
import { Frontier } from '../gen/frontier';
import { generate } from '../gen/generate';
import { step } from '../sim/step';
import { h, startLoop } from './ui';

/** Art pixels per cell for the hero: sharp enough full-width, cheap enough to generate on load. */
const ART_K = 2;

export interface HeroScene {
  node: HTMLElement;
  destroy(): void;
}

export function heroScene(): HeroScene {
  const dims = DEFAULT_DIMS;
  const canvas = h('canvas', { class: 'hero-canvas', role: 'img', 'aria-label': 'A shan shui landscape painting itself, with drifting clouds and birds' });
  const node = h('div', { class: 'hero-scene' }, canvas);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = { ...defaultParams(), mountainHeight: 0.62, spacing: 0.45, cloudiness: 0.65, wildlife: 0.7, wanderers: 0.35, wind: 0.4 };
  // a new painting on every visit (pages may use the wall clock and Math.random; the sim never does)
  const seed = Math.floor(Math.random() * 1e9);

  let renderer: Renderer | null = null;
  let bp: Blueprint | null = null;
  let world: World | null = null;
  let frontier: Frontier | null = null;

  const clock = new Clock(() => {
    if (!world || !frontier) return;
    frontier.advance(world, 6);
    step(world);
  });

  function paint(): void {
    renderer ??= new Renderer(canvas, dims, ART_K);
    bp = generate(seed, params, { k: ART_K });
    world = new World(dims, seed, { ...params });
    frontier = new Frontier(bp, 6);
    clock.reset();
    if (reduced) {
      frontier.revealAll(world); // no reveal animation: the finished painting, still
      for (let t = 0; t < 30; t++) step(world);
    }
    node.classList.add('ready');
  }

  // ---- run only while on screen ----
  let visible = true;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.05 });
  io.observe(node);
  clock.paused = reduced;

  const stop = startLoop(
    clock,
    () => {
      if (!renderer || !world || !frontier || !bp) return;
      renderer.draw(world, { frontierX: frontier.done ? undefined : frontier.x, art: artView(bp) });
    },
    () => visible && !document.hidden,
  );

  // generate once the page has painted, so the title shows at once
  const start = window.setTimeout(() => requestAnimationFrame(paint), 60);

  return {
    node,
    destroy: () => {
      clearTimeout(start);
      stop();
      io.disconnect();
    },
  };
}
