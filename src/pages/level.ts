import './bootstrap';
import { activeAbilities, type AbilityId } from '../core/abilities';
import { Clock } from '../core/clock';
import { El } from '../core/elements';
import { TICK_HZ } from '../core/constants';
import { describeGoal, evaluateGoal } from '../core/goals';
import { levels, type LevelDef } from '../core/levels';
import { defaultParams, params as paramDefs, type GenParams } from '../core/params';
import { DEFAULT_ART_K } from '../gen/artState';
import { artView, createBlueprint } from '../core/blueprint';
import { Renderer } from '../core/render';
import { ActionDriver } from '../core/replay';
import { World } from '../core/world';
import { Frontier } from '../gen/frontier';
import { mountainUnder, scan } from '../gen/scan';
import type { Blueprint } from '../core/blueprint';
import type { GoalSpec } from '../core/goals';
import type { Peak } from '../core/scan';
import { aimEnd, aimTunables, chargeOf, drawAim, isLineAbility, lineColor } from '../sim/lineAbility';
import { step } from '../sim/step';
import { siteHeader } from './chrome';
import { audio } from '../audio/engine';
import { submitWin, type WinData } from '../gallery/submit';
import { APP_VERSION } from '../gallery/version';
import { Fx } from './fx';
import { generateAsync } from './genClient';
import { arsenal } from './arsenal';
import { nameMenu } from './nameMenu';
import { brushCursor, button, displayScale, h, handscroll, panel, seal, soundToggle, startLoop, toCell } from './ui';

/** Header for players: no links to the workshops. */
function levelHeader(sub: string): HTMLElement {
  const brand = h(
    'a',
    { class: 'brand', href: './index.html' },
    seal(),
    h('span', { class: 'brand-name' }, 'Blade & Brush'),
    h('span', { class: 'brand-sub' }, sub),
  );
  return h('header', { class: 'top' }, h('h1', {}, brand), h('nav', {}, soundToggle(), h('a', { href: './index.html' }, 'All levels')));
}

/** The site header with the music's mute button at the end of its links. */
function withSoundToggle(header: HTMLElement): HTMLElement {
  header.querySelector('.site-nav')?.append(soundToggle());
  return header;
}

/** A flat two seconds the painting gets after the last stroke (or the seal) before it is judged, whatever is still moving. */
const SETTLE = 2 * TICK_HZ;

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
  /** The peaks the scanner counts, each placed on the rock summit of its mountain (not on a tree growing there). */
  let marks: { x: number; y: number; tall: boolean }[] = [];
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
  const submitNote = h('p', { class: 'submit-note' }); // in the completion scroll: where the painting was sent
  const names = nameMenu((alias) => void sendToGallery(alias)); // in the completion scroll: sign the painting
  let winData: WinData | null = null;
  const mount = h('span', { class: 'mount', 'aria-hidden': 'true' }); // the silk the painting is mounted on
  // a small gold bead on the bottom silk that follows the painting's song across the scroll
  const musicMark = h('span', { class: 'music-mark', 'aria-hidden': 'true' });
  const frame = h('div', { class: 'frame' }, mount, canvas, hudTool, banner, stamp, rollLeft, rollLead, musicMark);
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
    marks = [];
    clearTimeout(winTimer);
    winData = null;
    submitNote.replaceChildren();
    names.hide();
    names.busy(false);
    stamp.classList.remove('on');
    complete?.close();
    banner.hidden = true;
    fx.attach(world);
    audio.attach(world, bp); // each painting plays its own song as it unrolls
    clock.reset();
  }

  const clock = new Clock(() => {
    driver.apply(world);
    frontier.advance(world);
    step(world);
  });
  let complete: ReturnType<typeof handscroll> | undefined;
  restart(createBlueprint(level.seed, params, level.dims, level.setpieces)); // an empty scroll until the painting arrives
  audio.armOnGesture();
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
    brushCursor(canvas, world.w, radius);
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
    brushCursor(canvas, level.dims.w, radius);
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

  // ---- victory: the player signs the painting with a name and it goes to the gallery ----

  /** The finished painting as a picture, without the cursor, peak marks or ink trails drawn over it. */
  function snapshot(): string {
    renderer.draw(world, { art: artView(bp) });
    const out = document.createElement('canvas');
    out.width = Math.min(1440, canvas.width);
    out.height = Math.round((out.width * canvas.height) / canvas.width);
    out.getContext('2d')?.drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.85);
  }

  async function sendToGallery(alias: string): Promise<void> {
    if (!winData) return;
    const strokes = winData.result.strokes ?? 0;
    names.busy(true);
    submitNote.replaceChildren(`Sending your painting to the gallery as ${alias}…`);
    try {
      await submitWin(winData, alias);
      names.hide();
      submitNote.replaceChildren(
        'Sent to the gallery as ',
        h('b', { class: 'alias' }, alias),
        ` in ${strokes} ${strokes === 1 ? 'stroke' : 'strokes'}. `,
        h('a', { href: './gallery.html' }, 'See it'),
      );
    } catch {
      names.busy(false);
      submitNote.replaceChildren('The gallery could not be reached. Press Send to try again.');
    }
  }

  const next = levels.all()[levels.all().findIndex((l) => l.id === level.id) + 1];
  complete = handscroll(
    'level complete',
    h(
      'div',
      { class: 'complete' },
      h('h3', {}, '完成'),
      h('p', {}, 'The landscape matches the poem.'),
      names.node,
      submitNote,
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
    marks = markPeaks ? peakMarks(result.peaks, result.heights) : [];
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
    if (all && started) {
      phase = 'won';
      world.events.emit('levelWin', { levelId: level.id });
      winData = {
        levelId: level.id,
        seed: level.seed,
        params: { ...params },
        actionLog: driver.log,
        png: snapshot(),
        result: { pass: true, progress: 1, strokes: used, budget: level.actionBudget },
        scan: { ...result.counts },
        worldHash: world.hash(),
        appVersion: APP_VERSION,
      };
      submitNote.replaceChildren('Choose a name to sign your painting and send it to the gallery.');
      names.show();
      stamp.classList.add('on'); // the seal lands first, then the scroll unrolls
      winTimer = window.setTimeout(() => {
        complete!.node.hidden = false;
        complete!.open();
      }, 1100);
    } else {
      phase = 'failed';
      world.events.emit('levelFail', { levelId: level.id });
      bannerText.textContent = used >= level.actionBudget ? 'Out of ink: the painting does not match the poem yet.' : 'The painting does not match the poem yet.';
    }
  }

  /**
   * Where to mark each peak. The scanner measures the skyline including trees, so a peak's column can
   * be a tree top; the mark goes on the highest rock of the mountain the peak belongs to instead.
   * Peaks on untracked terrain (no mountain object) stay at the top of their column.
   */
  function peakMarks(found: Peak[], columnHeights: Int16Array): { x: number; y: number; tall: boolean }[] {
    const tall = 0.3 * level.dims.h; // DEFAULT_THRESHOLDS.tallFrac
    const { w, h, obj, el } = world;
    return found.map((p) => {
      const top = h - columnHeights[p.x];
      const mountain = mountainUnder(world, p.x, top);
      const box = mountain > 0 ? world.objects.get(mountain)?.bbox : undefined;
      if (box) {
        for (let y = Math.max(0, box[1]); y <= Math.min(h - 1, box[3]); y++) {
          let sum = 0;
          let n = 0;
          for (let x = Math.max(0, box[0]); x <= Math.min(w - 1, box[2]); x++) {
            if (obj[y * w + x] === mountain && el[y * w + x] === El.ROCK) (sum += x), n++;
          }
          if (n > 0) return { x: Math.round(sum / n), y: y - 4, tall: p.h >= tall };
        }
      }
      return { x: p.x, y: top - 4, tall: p.h >= tall };
    });
  }

  /** The peaks the scanner counts, marked on the painting: a red mark for a tall one, a ring for a lesser one. */
  function drawPeaks(g: CanvasRenderingContext2D): void {
    if (!markPeaks || !frontier.done) return;
    g.save();
    g.lineWidth = 1 / renderer.scale;
    for (const { x, y, tall } of marks) {
      if (tall) {
        g.fillStyle = 'rgba(178, 34, 34, 0.85)';
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - 3, y - 5);
        g.lineTo(x + 3, y - 5);
        g.closePath();
        g.fill();
      } else {
        g.strokeStyle = 'rgba(60, 60, 60, 0.75)';
        g.beginPath();
        g.arc(x, y - 2.5, 2.2, 0, Math.PI * 2);
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
    if (phase === 'play' && frontier.done && used > 0) finish();
  });

  stage.append(frame, status, complete.node);
  root.replaceChildren(
    withSoundToggle(siteHeader('levels', level.title ?? level.id)),
    h(
      'main',
      { class: 'layout level-layout', id: 'main' },
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
      renderer.draw(world, { frontierX: frontier.done ? undefined : frontier.x, art: artView(bp) });
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
      const at = audio.playhead();
      musicMark.classList.toggle('on', at !== null);
      if (at !== null) frame.style.setProperty('--music', at.toFixed(4));
      frame.classList.toggle('ready', frontier.done);
      const text = pending
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
      if (status.textContent !== text) status.textContent = text; // an unchanged write would still force a relayout
      fx.endFrame(canvas, dt);
    },
    () => !pending && fx.shouldAdvance(), // hold the scroll rolled up until the painting has arrived
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
    audio.detach();
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
