import './bootstrap';
import { activeAbilities, type AbilityId } from '../core/abilities';
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
import { aimEnd, chargeOf, drawAim, isLineAbility, lineColor } from '../sim/lineAbility';
import { step } from '../sim/step';
import { tunables } from '../sim/tunables';
import { Fx } from './fx';
import { arsenal } from './arsenal';
import { button, h, handscroll, panel, seal, startLoop, toCell } from './ui';

/** A panel that starts rolled up (secondary controls the player rarely needs). */
function rolledPanel(title: string, ...children: (Node | string)[]): HTMLElement {
  const p = panel(title, ...children);
  p.querySelector<HTMLButtonElement>('.panel-toggle')?.click();
  return p;
}

/** Header for players: no links to the workshops. */
function levelHeader(sub: string): HTMLElement {
  const brand = h(
    'a',
    { class: 'brand', href: './index.html' },
    seal(),
    h('span', { class: 'brand-name' }, 'Blade & Brush'),
    h('span', { class: 'brand-sub' }, sub),
  );
  return h('header', { class: 'top' }, h('h1', {}, brand), h('nav', {}, h('a', { href: './index.html' }, 'All levels')));
}

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
  const stage = h('div', { class: 'stage' });
  // on-canvas HUD: the selected blade, the painting-reveal bar, and the retry banner when the ink runs out
  const hudGlyph = h('span', { class: 'hud-glyph', 'aria-hidden': 'true' });
  const hudName = h('strong', {});
  const hudTool = h('div', { class: 'hud-tool' }, hudGlyph, hudName);
  const retry = button('Regenerate', () => regenerate(), { class: 'hud-retry' });
  const banner = h('div', { class: 'hud-banner', hidden: true, role: 'status' }, h('p', {}, 'Out of ink.'), retry);
  const reveal = h('span', { class: 'reveal-fill' });
  const revealBar = h('div', { class: 'reveal-bar', 'aria-hidden': 'true' }, reveal);
  // the red seal pressed onto the painting when the poem is complete
  const stamp = h('div', { class: 'stamp', 'aria-hidden': 'true' }, seal('完成', 'stamp-seal'));
  let winTimer = 0;
  const frame = h('div', { class: 'frame' }, canvas, hudTool, banner, revealBar, stamp);
  let tip = '';

  function regenerate(): void {
    bp = generate(level.seed, params, { features: level.featuresEnabled });
    world = new World(level.dims, level.seed, { ...params });
    frontier = new Frontier(bp);
    driver = new ActionDriver();
    used = 0;
    won = false;
    clearTimeout(winTimer);
    stamp.classList.remove('on');
    complete?.close();
    banner.hidden = true;
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
  const bar = arsenal((id, text) => {
    ability = id;
    tip = text;
    const a = activeAbilities(false).find((x) => x.id === id);
    hudGlyph.textContent = a?.icon ?? '';
    hudName.textContent = a?.name ?? '';
    stage.style.setProperty('--blade', lineColor(id));
  });
  const radiusDot = h('span', { class: 'brush-dot', 'aria-hidden': 'true' });
  const radiusInput = h('input', { type: 'range', min: 1, max: 24, step: 1, value: radius, 'aria-label': 'Brush size' });
  const setRadius = (r: number) => {
    radius = Math.max(1, Math.min(24, r));
    radiusInput.value = String(radius);
    radiusDot.style.setProperty('--d', `${6 + radius}px`);
  };
  radiusInput.addEventListener('input', () => setRadius(Number(radiusInput.value)));
  setRadius(radius);

  // ---- poem, goals, ink ----
  // Each poem line is a verse tied to the goal at the same position. A line with no goal of its own lights
  // up when every goal is met, and a goal with no line is listed by its description.
  const verses = Array.from({ length: Math.max(level.poem.length, level.goals.length) }, (_, i) => {
    const goal = level.goals[i];
    const line = level.poem[i];
    const row = h(
      'li',
      { class: 'verse', title: goal ? describeGoal(goal) : undefined },
      h('span', { class: 'verse-text' }, line ?? describeGoal(goal)),
      line !== undefined && goal ? h('span', { class: 'verse-goal' }, describeGoal(goal)) : '',
      goal ? h('span', { class: 'goal-bar' }, h('span', { class: 'goal-fill' })) : '',
    );
    return { goal, row };
  });
  // the poem is written on the painting itself, in vertical columns read right to left
  frame.append(h('ol', { class: 'inscription', 'aria-label': 'Poem' }, ...verses.map((v) => v.row)));
  const pips = Array.from({ length: level.actionBudget }, () => h('i', { class: 'pip' }));
  const inkCount = h('span', { class: 'ink-count' });
  const ink = h('div', { class: 'ink', role: 'img' }, h('span', { class: 'ink-label' }, 'Ink'), h('span', { class: 'pips' }, ...pips), inkCount);
  let shownInk = -1;
  const showInk = () => {
    const left = Math.max(0, level.actionBudget - used);
    if (left === shownInk) return;
    shownInk = left;
    pips.forEach((p, i) => p.classList.toggle('spent', i >= left));
    inkCount.textContent = `${left} / ${level.actionBudget}`;
    ink.setAttribute('aria-label', `Ink left: ${left} of ${level.actionBudget}`);
  };

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
    for (const v of verses) {
      if (!v.goal) continue;
      const { pass, progress } = evaluateGoal(result, v.goal);
      all &&= pass;
      v.row.classList.toggle('met', pass);
      v.row.style.setProperty('--p', `${Math.round(progress * 100)}%`);
    }
    for (const v of verses) if (!v.goal) v.row.classList.toggle('met', all);
    if (all && changed() && !won) {
      won = true;
      stamp.classList.add('on'); // the seal lands first, then the scroll unrolls
      winTimer = window.setTimeout(() => {
        complete!.node.hidden = false;
        complete!.open();
      }, 1100);
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

  stage.append(frame, status, complete.node);
  root.replaceChildren(
    levelHeader(level.id),
    h(
      'main',
      { class: 'layout level-layout' },
      stage,
      h(
        'aside',
        { class: 'controls' },
                panel('Abilities', bar.node, ink, h('label', { class: 'row brush-row' }, h('span', {}, 'Brush size'), radiusInput, radiusDot)),
        panel(
          'Painting',
          paramRows,
          h('p', { class: 'home-note' }, 'Shape changes apply when you regenerate.'),
          button('Regenerate', regenerate),
        ),
        rolledPanel('Tuning', tuning),
      ),
    ),
  );

  bar.selectIndex(0); // start with the first ability selected
  let frames = 0;
  const stop = startLoop(
    clock,
    (dt) => {
      renderer.draw(world, { cursor, frontierX: frontier.done ? undefined : frontier.x, art: bp.art ? { art: bp.art, el: bp.el } : undefined });
      fx.draw(renderer.g);
      if (down && cursor && isLineAbility(ability)) {
        const aim = aimEnd(pressedAt.x, pressedAt.y, cursor.x, cursor.y);
        drawAim(renderer.g, ability, aim, radius, chargeOf(world.tick - pressedTick));
      }
      showInk();
      if (frames++ % 10 === 0 && frontier.done) checkGoals();
      const spent = frontier.done && used >= level.actionBudget && !won;
      bar.setSpent(spent);
      banner.hidden = !spent;
      revealBar.classList.toggle('done', frontier.done);
      reveal.style.width = `${Math.round((frontier.x / level.dims.w) * 100)}%`;
      status.textContent = !frontier.done ? 'The landscape is painting itself…' : spent ? 'Out of ink. Regenerate to try again.' : tip;
      fx.endFrame(canvas, dt);
    },
    () => fx.shouldAdvance(),
  );
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (/^[1-9]$/.test(e.key)) bar.selectIndex(Number(e.key) - 1);
    else if (e.key === '[') setRadius(radius - 1);
    else if (e.key === ']') setRadius(radius + 1);
  };
  addEventListener('keydown', onKey);
  return () => {
    stop();
    fx.detach();
    clearTimeout(winTimer);
    removeEventListener('keydown', onKey);
  };
}

function levelMissing(root: HTMLElement, id: string | null): void {
  const list = h('ul', { class: 'home-steps' });
  for (const l of levels.all()) list.append(h('li', {}, h('a', { href: `./level.html?level=${encodeURIComponent(l.id)}` }, l.id)));
  root.replaceChildren(
    levelHeader('Level'),
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
