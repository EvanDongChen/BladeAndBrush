import './bootstrap';
import type { AbilityId } from '../core/abilities';
import { Clock } from '../core/clock';
import { levels, type LevelDef } from '../core/levels';
import { defaultParams, type GenParams } from '../core/params';
import { Renderer } from '../core/render';
import { ActionDriver } from '../core/replay';
import { World } from '../core/world';
import { Frontier } from '../gen/frontier';
import { generate } from '../gen/generate';
import type { Blueprint } from '../core/blueprint';
import { aimEnd, chargeOf, drawAim, isLineAbility } from '../sim/lineAbility';
import { step } from '../sim/step';
import { Fx } from './fx';
import { abilityBar, button, h, pageHeader, panel, startLoop, toCell } from './ui';

/**
 * Player-facing level page: ?level=<id>. The player gets the abilities, a Regenerate button,
 * and the level's params and tuning. Nothing else from the workshops is exposed here.
 */
export function mountLevel(root: HTMLElement, level: LevelDef): () => void {
  const params: GenParams = defaultParams();
  for (const [key, p] of Object.entries(level.params)) params[key] = p.value;

  let world: World;
  let bp: Blueprint;
  let frontier: Frontier;
  let driver = new ActionDriver();
  let ability: AbilityId = '';
  let radius = 4;

  const canvas = h('canvas', { class: 'grid paintable' });
  const renderer = new Renderer(canvas, level.dims);
  const fx = new Fx();
  const status = h('div', { class: 'status' });

  function regenerate(): void {
    bp = generate(level.seed, params, { features: level.featuresEnabled });
    world = new World(level.dims, level.seed, { ...params });
    frontier = new Frontier(bp);
    driver = new ActionDriver();
    fx.attach(world);
    clock.reset();
  }

  const clock = new Clock(() => {
    driver.apply(world);
    frontier.advance(world);
    step(world);
  });
  regenerate();

  // ---- pointer input -> action driver ----
  let down = false;
  let last = { x: 0, y: 0, t: 0 };
  let pressedAt = { x: 0, y: 0 };
  let pressedTick = 0;
  let cursor: { x: number; y: number; r: number } | null = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (!ability || !frontier.done) return;
    canvas.setPointerCapture?.(e.pointerId);
    const p = toCell(canvas, e);
    down = true;
    pressedAt = p;
    pressedTick = world.tick;
    cursor = { ...p, r: radius };
    last = { ...p, t: performance.now() };
    driver.begin(ability, { ...p, speed: 0 }, { radius });
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = toCell(canvas, e);
    cursor = { ...p, r: radius };
    if (!down) return;
    const now = performance.now();
    const ticks = Math.max(1e-3, ((now - last.t) / Clock.STEP_MS) * clock.speed);
    const speed = Math.round((Math.hypot(p.x - last.x, p.y - last.y) / ticks) * 1000) / 1000;
    last = { ...p, t: now };
    driver.move({ ...p, speed });
  });
  const release = () => {
    if (down) driver.end();
    down = false;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => (cursor = null));

  // ---- controls ----
  const bar = abilityBar((id) => (ability = id));
  bar.node.querySelector('button')?.click(); // start with the first ability selected
  const radiusInput = h('input', { type: 'range', min: 1, max: 24, step: 1, value: radius });
  radiusInput.addEventListener('input', () => (radius = Number(radiusInput.value)));

  root.replaceChildren(
    pageHeader(level.id),
    h(
      'main',
      { class: 'layout' },
      h('div', { class: 'stage' }, canvas, status),
      h(
        'aside',
        { class: 'controls' },
        panel('Abilities', bar.node, h('label', { class: 'row' }, h('span', {}, 'Brush size'), radiusInput)),
        panel('Painting', button('Regenerate', regenerate)),
      ),
    ),
  );

  const stop = startLoop(
    clock,
    (dt) => {
      renderer.draw(world, { cursor, frontierX: frontier.done ? undefined : frontier.x, art: bp.art });
      fx.draw(renderer.g);
      if (down && cursor && isLineAbility(ability)) {
        const aim = aimEnd(pressedAt.x, pressedAt.y, cursor.x, cursor.y);
        drawAim(renderer.g, ability, aim, radius, chargeOf(world.tick - pressedTick));
      }
      status.textContent = frontier.done ? `tick ${world.tick}` : 'The landscape is painting itself…';
      fx.endFrame(canvas, dt);
    },
    () => fx.shouldAdvance(),
  );
  return () => {
    stop();
    fx.detach();
  };
}

function levelMissing(root: HTMLElement, id: string | null): void {
  const list = h('ul', { class: 'home-steps' });
  for (const l of levels.all()) list.append(h('li', {}, h('a', { href: `./level.html?level=${encodeURIComponent(l.id)}` }, l.id)));
  root.replaceChildren(
    pageHeader('Level'),
    h('main', { class: 'shell home' }, panel(id ? `No level called "${id}"` : 'Choose a level', list)),
  );
}

const app = document.getElementById('app');
if (app) {
  const id = new URLSearchParams(location.search).get('level');
  const level = id ? levels.get(id) : undefined;
  if (level) mountLevel(app, level);
  else levelMissing(app, id);
}
