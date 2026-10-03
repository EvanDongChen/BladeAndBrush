import './bootstrap';
import type { AbilityId } from '../core/abilities';
import { Clock } from '../core/clock';
import { describeGoal, evaluateGoal } from '../core/goals';
import { levels, type LevelDef } from '../core/levels';
import { defaultParams, params as paramDefs, type GenParams } from '../core/params';
import { Renderer } from '../core/render';
import { ActionDriver } from '../core/replay';
import { World } from '../core/world';
import { Frontier } from '../gen/frontier';
import { generate } from '../gen/generate';
import { scan } from '../gen/scan';
import type { Blueprint } from '../core/blueprint';
import { aimEnd, chargeOf, drawAim, isLineAbility } from '../sim/lineAbility';
import { step } from '../sim/step';
import { tunables } from '../sim/tunables';
import { Fx } from './fx';
import { abilityBar, button, h, handscroll, pageHeader, panel, startLoop, toCell } from './ui';

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
  let used = 0; // ability uses spent this round
  let won = false;
  let tuningTouched = false;
  const initial = { ...params };

  const canvas = h('canvas', { class: 'grid paintable' });
  const renderer = new Renderer(canvas, level.dims);
  const fx = new Fx();
  const status = h('div', { class: 'status' });

  function regenerate(): void {
    bp = generate(level.seed, params, { features: level.featuresEnabled });
    world = new World(level.dims, level.seed, { ...params });
    frontier = new Frontier(bp);
    driver = new ActionDriver();
    used = 0;
    won = false;
    complete?.close();
    fx.attach(world);
    clock.reset();
  }

  const clock = new Clock(() => {
    driver.apply(world);
    frontier.advance(world);
    step(world);
  });
  let complete: ReturnType<typeof handscroll> | undefined;
  regenerate();

  // ---- pointer input -> action driver ----
  let down = false;
  let last = { x: 0, y: 0, t: 0 };
  let pressedAt = { x: 0, y: 0 };
  let pressedTick = 0;
  let cursor: { x: number; y: number; r: number } | null = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (!ability || !frontier.done || used >= level.actionBudget) return;
    canvas.setPointerCapture?.(e.pointerId);
    const p = toCell(canvas, e);
    used++;
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

  // ---- poem, goals, ink ----
  const poem = h('p', { class: 'poem level-poem' });
  level.poem.forEach((line, i) => {
    if (i) poem.append(h('br'));
    poem.append(line);
  });
  const goalRows = level.goals.map((g) => {
    const fill = h('span', { class: 'goal-fill' });
    const row = h('li', { class: 'goal' }, h('span', { class: 'goal-text' }, describeGoal(g)), h('span', { class: 'goal-bar' }, fill));
    return { g, row, fill };
  });
  const goalList = h('ul', { class: 'goals' }, ...goalRows.map((r) => r.row));
  const ink = h('p', { class: 'ink' });

  const next = levels.all()[levels.all().findIndex((l) => l.id === level.id) + 1];
  complete = handscroll(
    'level complete',
    h(
      'div',
      { class: 'complete' },
      h('h3', {}, '完成'),
      h('p', {}, 'The landscape matches the poem.'),
      h(
        'p',
        { class: 'cta-row' },
        next ? h('a', { class: 'home-cta', href: `./level.html?level=${encodeURIComponent(next.id)}` }, 'Next level') : '',
        h('a', { class: 'home-cta', href: './index.html' }, 'All levels'),
      ),
    ),
  );
  complete.node.hidden = true;

  /** Has the player changed anything yet? Goals the fresh painting already meets do not count. */
  const changed = () => used > 0 || tuningTouched || Object.keys(initial).some((k) => params[k] !== initial[k]);

  function checkGoals(): void {
    const result = scan(world);
    let all = true;
    for (const r of goalRows) {
      const { pass, progress } = evaluateGoal(result, r.g);
      all &&= pass;
      r.row.classList.toggle('met', pass);
      r.fill.style.width = `${Math.round(progress * 100)}%`;
    }
    if (all && changed() && !won) {
      won = true;
      complete!.node.hidden = false;
      requestAnimationFrame(() => complete!.open());
    }
  }

  // ---- params: the level decides which are visible or locked ----
  const paramRows = h('div', { class: 'rows' });
  for (const def of paramDefs.all()) {
    const rule = level.params[def.key];
    if (rule?.visible === false) continue;
    const out = h('output', {}, String(params[def.key]));
    const input = h('input', { type: 'range', min: def.min, max: def.max, step: def.step, value: params[def.key], disabled: rule?.locked });
    input.addEventListener('input', () => {
      params[def.key] = Number(input.value);
      out.textContent = input.value;
      world.params[def.key] = params[def.key]; // live for the sim; the painting changes on Regenerate
    });
    paramRows.append(h('label', { class: 'row' }, h('span', {}, def.label), input, out));
  }

  // ---- tuning: how each ability and behavior feels ----
  const tuning = h('div', { class: 'registries' });
  for (const g of tunables.all()) {
    const rows = h('div', { class: 'rows' });
    for (const [key, [min, max, stepSize]] of Object.entries(g.ranges)) {
      const out = h('output', {}, String(g.values[key]));
      const input = h('input', { type: 'range', min, max, step: stepSize, value: g.values[key] });
      input.addEventListener('input', () => {
        g.values[key] = Number(input.value);
        out.textContent = input.value;
        tuningTouched = true;
      });
      rows.append(h('label', { class: 'row' }, h('span', {}, key), input, out));
    }
    tuning.append(h('details', {}, h('summary', {}, g.name), rows));
  }

  root.replaceChildren(
    pageHeader(level.id),
    h(
      'main',
      { class: 'layout' },
      h('div', { class: 'stage' }, canvas, status, complete.node),
      h(
        'aside',
        { class: 'controls' },
        panel('Poem', poem, goalList, ink),
        panel('Abilities', bar.node, h('label', { class: 'row' }, h('span', {}, 'Brush size'), radiusInput)),
        panel(
          'Painting',
          paramRows,
          h('p', { class: 'home-note' }, 'Shape changes apply when you regenerate.'),
          button('Regenerate', regenerate),
        ),
        panel('Tuning', tuning),
      ),
    ),
  );

  let frame = 0;
  const stop = startLoop(
    clock,
    (dt) => {
      renderer.draw(world, { cursor, frontierX: frontier.done ? undefined : frontier.x, art: bp.art });
      fx.draw(renderer.g);
      if (down && cursor && isLineAbility(ability)) {
        const aim = aimEnd(pressedAt.x, pressedAt.y, cursor.x, cursor.y);
        drawAim(renderer.g, ability, aim, radius, chargeOf(world.tick - pressedTick));
      }
      ink.textContent = `Ink left: ${level.actionBudget - used} of ${level.actionBudget}`;
      if (frame++ % 10 === 0 && frontier.done) checkGoals();
      status.textContent = !frontier.done
        ? 'The landscape is painting itself…'
        : used >= level.actionBudget && !won
          ? 'Out of ink. Regenerate to try again.'
          : `tick ${world.tick}`;
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
