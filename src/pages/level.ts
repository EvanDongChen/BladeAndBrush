import './bootstrap';
import { activeAbilities, type AbilityId } from '../core/abilities';
import { Clock } from '../core/clock';
import { describeGoal, evaluateGoal } from '../core/goals';
import { levels, type LevelDef } from '../core/levels';
import { defaultParams, params as paramDefs, type GenParams } from '../core/params';
import { DEFAULT_ART_K } from '../gen/artState';
import { artView, createBlueprint } from '../core/blueprint';
import { Renderer } from '../core/render';
import { ActionDriver } from '../core/replay';
import { World } from '../core/world';
import { Frontier } from '../gen/frontier';
import { scan } from '../gen/scan';
import type { Blueprint } from '../core/blueprint';
import type { GoalSpec } from '../core/goals';
import type { Peak } from '../core/scan';
import { bodyCount } from '../sim/behaviors/rigid';
import { aimEnd, aimTunables, chargeOf, drawAim, isLineAbility, lineColor } from '../sim/lineAbility';
import { step } from '../sim/step';
import { Fx } from './fx';
import { generateAsync } from './genClient';
import { arsenal } from './arsenal';
import { button, displayScale, h, handscroll, panel, seal, startLoop, toCell } from './ui';

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

/** Ticks the painting gets to settle after the last stroke (or the seal) before it is judged. */
const SETTLE = 240;
/** ...and at most this many more while pieces are still falling. */
const SETTLE_MAX = 600;

/** Does the level ask about mountains (so the page marks the peaks it counts)? */
function aboutPeaks(goals: GoalSpec[]): boolean {
  return goals.some((g) =>
    g.type === 'all' && Array.isArray(g.of) ? aboutPeaks(g.of as GoalSpec[]) : /Mountain|Moon|peak/i.test(String(g.metric ?? '')) && g.metric !== 'moonBroken',
  );
}

/**
 * Player-facing level page: ?level=<id>. The player tunes the few sliders the level offers (the
 * painting repaints when one is let go), then spends the ink. When the ink is gone (or the player
 * seals the painting early) the painting settles and is judged against the poem.
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
  let used = 0; // strokes released this round
  /** play: strokes left; settling: ink spent or sealed, waiting for things to come to rest; then judged. */
  let phase: 'play' | 'settling' | 'won' | 'failed' = 'play';
  let judgeAt = 0;
  let peaks: Peak[] = [];
  let heights: Int16Array | null = null;
  const markPeaks = aboutPeaks(level.goals);
  const initial = { ...params };

  const canvas = h('canvas', { class: 'grid paintable' });
  const renderer = new Renderer(canvas, level.dims, displayScale(level.dims.w, DEFAULT_ART_K));
  canvas.style.imageRendering = 'auto'; // the canvas is k x the grid: smooth it, do not pixelate
  const fx = new Fx();
  const status = h('div', { class: 'status' });
  const stage = h('div', { class: 'stage' });
  // on-canvas HUD: the selected blade, the scroll rollers, and the retry banner when the ink runs out
  const hudGlyph = h('span', { class: 'hud-glyph', 'aria-hidden': 'true' });
  const hudName = h('strong', {});
  const hudTool = h('div', { class: 'hud-tool' }, hudGlyph, hudName);
  const retry = button('Try again', () => regenerate(), { class: 'hud-retry' });
  const bannerText = h('p', {}, 'Out of ink.');
  const banner = h('div', { class: 'hud-banner', hidden: true, role: 'status' }, bannerText, retry);
  // two rollers: one fixed at the left edge, one riding the frontier so the paper unrolls as the landscape draws
  const rollLeft = h('span', { class: 'roll', 'aria-hidden': 'true' });
  const rollLead = h('span', { class: 'roll lead', 'aria-hidden': 'true' });
  // the red seal pressed onto the painting when the poem is complete
  const stamp = h('div', { class: 'stamp', 'aria-hidden': 'true' }, seal('完成', 'stamp-seal'));
  let winTimer = 0;
  const mount = h('span', { class: 'mount', 'aria-hidden': 'true' }); // the silk the painting is mounted on
  const frame = h('div', { class: 'frame' }, mount, canvas, hudTool, banner, stamp, rollLeft, rollLead);
  let tip = '';

  /** Generation runs on a worker: until it answers, the old painting (or an empty scroll) stays. */
  let pending = 0;
  let painted: GenParams | null = null;
  function regenerate(): void {
    // "Try again" with the same sliders reuses the painting: no need to generate it again
    if (painted && paramDefs.all().every((d) => painted![d.key] === params[d.key])) {
      restart(bp);
      return;
    }
    const want = { ...params };
    const id = ++pending;
    generateAsync(level.seed, want, { features: level.featuresEnabled, setpieces: level.setpieces }, renderer.scale).then((next) => {
      if (id !== pending || stopped) return; // a newer repaint was asked for meanwhile
      pending = 0;
      painted = want;
      restart(next);
    });
  }

  function restart(next: Blueprint): void {
    bp = next;
    world = new World(level.dims, level.seed, { ...params });
    frontier = new Frontier(bp);
    driver = new ActionDriver();
    used = 0;
    phase = 'play';
    peaks = [];
    heights = null;
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
  restart(createBlueprint(level.seed, params, level.dims, level.setpieces)); // an empty scroll until the painting arrives
  regenerate();

  // ---- pointer input -> action driver ----
  let down = false;
  let last = { x: 0, y: 0, t: 0 };
  let pressedAt = { x: 0, y: 0 };
  let pressedTick = 0;
  let cursor: { x: number; y: number; r: number } | null = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (!ability || !frontier.done || phase !== 'play' || used >= level.actionBudget) return;
    canvas.setPointerCapture?.(e.pointerId);
    const p = toCell(canvas, e, renderer.scale);
    down = true;
    pressedAt = p;
    pressedTick = world.tick;
    cursor = { ...p, r: radius };
    last = { ...p, t: performance.now() };
    driver.begin(ability, { ...p, speed: 0 }, { radius });
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = toCell(canvas, e, renderer.scale);
    cursor = { ...p, r: radius };
    if (!down) return;
    const now = performance.now();
    const ticks = Math.max(1e-3, ((now - last.t) / Clock.STEP_MS) * clock.speed);
    const speed = Math.round((Math.hypot(p.x - last.x, p.y - last.y) / ticks) * 1000) / 1000;
    last = { ...p, t: now };
    driver.move({ ...p, speed });
  });
  /** Settle for a while, then judge the painting. */
  const finish = (ticks = SETTLE) => {
    phase = 'settling';
    judgeAt = world.tick + ticks;
  };
  const release = () => {
    if (!down) return;
    driver.end();
    down = false;
    // ink is spent when a stroke is actually made (a line too short to fire costs nothing)
    const fired = !isLineAbility(ability) || (cursor !== null && Math.hypot(cursor.x - pressedAt.x, cursor.y - pressedAt.y) >= aimTunables.minLength);
    if (!fired) return;
    used++;
    if (used >= level.actionBudget) finish();
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
      { class: line === undefined ? 'verse plain' : 'verse', title: goal ? describeGoal(goal) : undefined },
      h('span', { class: 'verse-text' }, line ?? describeGoal(goal)),
      line !== undefined && goal ? h('span', { class: 'verse-goal' }, describeGoal(goal)) : '',
      goal ? h('span', { class: 'goal-bar' }, h('span', { class: 'goal-fill' })) : '',
    );
    return { goal, row };
  });
  // the goals are written on the painting itself, top right
  frame.append(h('ol', { class: 'inscription', 'aria-label': 'Goals' }, ...verses.map((v) => v.row)));
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
  const changed = () => used > 0 || Object.keys(initial).some((k) => params[k] !== initial[k]);

  let lastScan: ReturnType<typeof scan> | null = null;
  let lastScanWorld: World | null = null;
  let lastScanKey = -1;
  let checkQueued = false;
  let stopped = false;
  /** Run checkGoals when the browser is idle, so a scan never lands inside a frame. */
  function queueCheck(): void {
    if (checkQueued) return;
    checkQueued = true;
    const run = () => {
      checkQueued = false;
      if (!stopped) checkGoals();
    };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 300 });
    else setTimeout(run, 0);
  }

  /** Light the verses as the painting changes; once it has settled after the last stroke, judge it. */
  function checkGoals(): void {
    // the scan reads cells, owners, objects and object stats: rescan only when those changed
    const key = scanKey(world);
    if (!lastScan || world !== lastScanWorld || key !== lastScanKey) {
      lastScan = scan(world);
      lastScanWorld = world;
      lastScanKey = key;
    }
    const result = lastScan;
    peaks = result.peaks;
    heights = result.heights;
    const started = changed();
    let all = true;
    for (const v of verses) {
      if (!v.goal) continue;
      const { pass, progress } = evaluateGoal(result, v.goal);
      all &&= pass;
      v.row.classList.toggle('met', pass && started); // a fresh painting that already matches does not light up
      v.row.style.setProperty('--p', `${Math.round(progress * 100)}%`);
    }
    for (const v of verses) if (!v.goal) v.row.classList.toggle('met', all && started);
    if (phase !== 'settling' || world.tick < judgeAt) return;
    if (bodyCount(world) > 0 && world.tick < judgeAt + SETTLE_MAX - SETTLE) return; // still falling
    if (all && started) {
      phase = 'won';
      stamp.classList.add('on'); // the seal lands first, then the scroll unrolls
      winTimer = window.setTimeout(() => {
        complete!.node.hidden = false;
        complete!.open();
      }, 1100);
    } else {
      phase = 'failed';
      bannerText.textContent = used >= level.actionBudget ? 'Out of ink: the painting does not match the poem yet.' : 'The painting does not match the poem yet.';
    }
  }

  /** The peaks the scanner counts, marked on the painting: a red mark for a tall one, a ring for a lesser one. */
  function drawPeaks(g: CanvasRenderingContext2D): void {
    if (!markPeaks || !heights || !frontier.done) return;
    const tall = 0.3 * level.dims.h; // DEFAULT_THRESHOLDS.tallFrac
    g.save();
    g.lineWidth = 1 / renderer.scale;
    for (const p of peaks) {
      const y = level.dims.h - heights[p.x] - 4;
      if (p.h >= tall) {
        g.fillStyle = 'rgba(178, 34, 34, 0.85)';
        g.beginPath();
        g.moveTo(p.x, y);
        g.lineTo(p.x - 3, y - 5);
        g.lineTo(p.x + 3, y - 5);
        g.closePath();
        g.fill();
      } else {
        g.strokeStyle = 'rgba(60, 60, 60, 0.75)';
        g.beginPath();
        g.arc(p.x, y - 2.5, 2.2, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.restore();
  }

  // ---- params: only the ones the level offers, under its own names and ranges ----
  // Letting go of a slider repaints the painting (and starts the round over): tuning is part of the puzzle.
  const paramRows = h('div', { class: 'rows' });
  for (const def of paramDefs.all()) {
    const rule = level.params[def.key];
    if (!rule || rule.visible === false) continue;
    const out = h('output', {}, String(params[def.key]));
    const input = h('input', {
      type: 'range',
      min: rule.min ?? def.min,
      max: rule.max ?? def.max,
      step: def.step,
      value: params[def.key],
      disabled: rule.locked,
    });
    input.addEventListener('input', () => {
      params[def.key] = Number(input.value);
      out.textContent = input.value;
    });
    input.addEventListener('change', () => regenerate());
    paramRows.append(h('label', { class: 'row' }, h('span', {}, rule.label ?? def.label), input, out));
  }
  const sealButton = button('Seal the painting', () => {
    if (phase === 'play' && frontier.done && used > 0) finish(60);
  });

  stage.append(frame, status, complete.node);
  root.replaceChildren(
    levelHeader(level.title ?? level.id),
    h(
      'main',
      { class: 'layout level-layout' },
      stage,
      h(
        'aside',
        { class: 'controls' },
                panel(
          'Shape the painting',
          h('p', { class: 'home-note' }, level.tip ?? 'Tune the painting before you cut: it repaints when you let go of a slider.'),
          paramRows,
          button('Start over', regenerate),
        ),
        panel('Abilities', bar.node, ink, h('label', { class: 'row brush-row' }, h('span', {}, 'Brush size'), radiusInput, radiusDot), sealButton),
      ),
    ),
  );

  bar.selectIndex(0); // start with the first ability selected
  let frames = 0;
  let shownX = -1;
  const stop = startLoop(
    clock,
    (dt) => {
      renderer.draw(world, { cursor, frontierX: frontier.done ? undefined : frontier.x, art: artView(bp) });
      renderer.inCells((g) => {
        fx.draw(g);
        drawPeaks(g);
      });
      if (down && cursor && isLineAbility(ability)) {
        const aim = aimEnd(pressedAt.x, pressedAt.y, cursor.x, cursor.y);
        renderer.inCells((g) => drawAim(g, ability, aim, radius, chargeOf(world.tick - pressedTick)));
      }
      showInk();
      if (frames++ % 10 === 0 && frontier.done && !pending) queueCheck();
      bar.setSpent(phase !== 'play');
      banner.hidden = phase !== 'failed';
      sealButton.toggleAttribute('disabled', phase !== 'play' || used === 0);
      if (frontier.x !== shownX) {
        shownX = frontier.x;
        frame.style.setProperty('--p', String(frontier.x / level.dims.w));
      }
      frame.classList.toggle('ready', frontier.done);
      status.textContent = pending
        ? 'Grinding the ink…'
        : !frontier.done
        ? 'The landscape is painting itself…'
        : phase === 'settling'
          ? 'The ink is drying…'
          : phase === 'failed'
            ? 'Not yet. Try again: tune the painting, then cut.'
            : phase === 'won'
              ? 'The landscape matches the poem.'
              : tip;
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
    stopped = true;
    stop();
    fx.detach();
    clearTimeout(winTimer);
    removeEventListener('keydown', onKey);
  };
}

/** A cheap fingerprint of everything the scan reads: cells, owners, object ids and object stats. */
function scanKey(world: World): number {
  let h = 0x811c9dc5;
  const fold = (a: Uint8Array | Uint16Array) => {
    const words = new Uint32Array(a.buffer, a.byteOffset, a.byteLength >> 2);
    for (let i = 0; i < words.length; i++) h = Math.imul(h ^ words[i], 0x01000193);
    for (let i = (words.length * 4) / a.BYTES_PER_ELEMENT; i < a.length; i++) h = Math.imul(h ^ a[i], 0x01000193);
  };
  fold(world.el);
  fold(world.owner);
  fold(world.obj);
  for (const o of world.objects.values()) {
    h = Math.imul(h ^ o.id ^ o.cells, 0x01000193);
    for (const v of Object.values(o.stats)) h = Math.imul(h ^ Math.round(v * 1000), 0x01000193);
  }
  return h >>> 0;
}

function levelMissing(root: HTMLElement, id: string | null): void {
  const list = h('ul', { class: 'home-steps' });
  for (const l of levels.all()) list.append(h('li', {}, h('a', { href: `./level.html?level=${encodeURIComponent(l.id)}` }, l.title ?? l.id)));
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
