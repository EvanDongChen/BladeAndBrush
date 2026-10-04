import './bootstrap';
import { activeAbilities } from '../core/abilities';
import { Clock } from '../core/clock';
import { defaultParams } from '../core/params';
import { Renderer } from '../core/render';
import { ActionDriver } from '../core/replay';
import { World } from '../core/world';
import { DEFAULT_ART_K } from '../gen/artState';
import { aimEnd, aimTunables, chargeOf, drawAim, isLineAbility, lineColor } from '../sim/lineAbility';
import { step } from '../sim/step';
import { arsenal } from './arsenal';
import { siteHeader } from './chrome';
import { Fx } from './fx';
import { brushCursor, button, displayScale, fixedPanel, h, startLoop, toCell } from './ui';
import { LESSONS, TUTORIAL_DIMS, TUTORIAL_SEED, type Lesson } from './tutorialLessons';

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const DONE_KEY = 'bb-tutorial-done';
/** Ticks before "Show me" starts its first stroke, and between strokes. */
const DEMO_PAUSE = 40;

function readDone(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function writeDone(done: Set<string>): void {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
  } catch {
    /* private mode: just do not remember it */
  }
}

/** The "Show me" stroke in progress: which stroke, and the ticks it presses and lets go on. */
interface Demo {
  stroke: number;
  pressAt: number;
  releaseAt: number;
  pressed: boolean;
}

/**
 * The tutorial: one small scene per ability, each built to show what that stroke does best (push
 * a boulder off a ledge, burn a grove, fill a pond...). The player learns one stroke at a time;
 * "Show me" plays the stroke that solves the lesson, and the next lesson opens once it is done.
 */
export function mountTutorial(root: HTMLElement): () => void {
  const done = readDone();
  const query = new URLSearchParams(location.search);
  const fromUrl = Number(query.get('step')) - 1;
  let index = LESSONS[fromUrl] ? fromUrl : Math.max(0, LESSONS.findIndex((l) => !done.has(l.ability)));
  let lesson: Lesson = LESSONS[index];
  let world = new World(TUTORIAL_DIMS, TUTORIAL_SEED, defaultParams());
  let driver = new ActionDriver();
  let solved = false;
  let demo: Demo | null = null;

  const canvas = h('canvas', { class: 'grid paintable' });
  const renderer = new Renderer(canvas, TUTORIAL_DIMS, displayScale(TUTORIAL_DIMS.w, DEFAULT_ART_K));
  canvas.style.imageRendering = 'auto';
  const fx = new Fx();
  const clock = new Clock(() => {
    runDemo();
    driver.apply(world);
    step(world);
  });

  // ---- the scroll ----
  const hudGlyph = h('span', { class: 'hud-glyph', 'aria-hidden': 'true' });
  const hudName = h('strong', {});
  const hudTool = h('div', { class: 'hud-tool' }, hudGlyph, hudName);
  const praise = h('div', { class: 'tut-praise', 'aria-hidden': 'true' }, '好');
  const frame = h(
    'div',
    { class: 'frame ready', style: '--p: 1' },
    h('span', { class: 'mount', 'aria-hidden': 'true' }),
    canvas,
    hudTool,
    praise,
    h('span', { class: 'roll', 'aria-hidden': 'true' }),
    h('span', { class: 'roll lead', 'aria-hidden': 'true' }),
  );
  const status = h('div', { class: 'status' });
  const stage = h('div', { class: 'stage' }, frame, status);

  // ---- the lesson panel ----
  const steps = h('ol', { class: 'tut-steps', 'aria-label': 'Lessons' });
  const stepButtons = LESSONS.map((l, i) => {
    const a = activeAbilities(false).find((x) => x.id === l.ability);
    const b = h(
      'button',
      { type: 'button', class: 'tut-step', style: `--blade: ${lineColor(l.ability)}` },
      h('span', { class: 'tut-step-num', 'aria-hidden': 'true' }, NUMERALS[i]),
      h('span', { class: 'tut-step-glyph', 'aria-hidden': 'true' }, a?.icon ?? ''),
      h('span', { class: 'tut-step-name' }, a?.name ?? l.ability),
    );
    b.addEventListener('click', () => open(i));
    steps.append(h('li', {}, b));
    return b;
  });
  const title = h('h2', { class: 'tut-title' });
  const teach = h('p', { class: 'tut-teach' });
  const goalText = h('span', { class: 'tut-goal-text' });
  const goalFill = h('span', { class: 'tut-goal-fill' });
  const goal = h('div', { class: 'tut-goal' }, goalText, h('span', { class: 'tut-goal-bar' }, goalFill));
  const bar = arsenal(() => {});
  const showMe = button('Show me', () => startDemo());
  const reset = button('Reset', () => open(index));
  const next = h('a', { class: 'home-cta tut-next' });

  // ---- pointer input -> action driver ----
  let down = false;
  let last = { x: 0, y: 0, t: 0 };
  let pressedAt = { x: 0, y: 0 };
  let pressedTick = 0;
  let cursor: { x: number; y: number } | null = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (demo) return;
    canvas.setPointerCapture?.(e.pointerId);
    const p = toCell(canvas, e, renderer.scale);
    down = true;
    pressedAt = p;
    pressedTick = world.tick;
    cursor = p;
    last = { ...p, t: performance.now() };
    driver.begin(lesson.ability, { ...p, speed: 0 }, { radius: lesson.radius });
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = toCell(canvas, e, renderer.scale);
    cursor = p;
    brushCursor(canvas, world.w, lesson.radius);
    if (!down) return;
    const now = performance.now();
    const ticks = Math.max(1e-3, ((now - last.t) / Clock.STEP_MS) * clock.speed);
    const speed = Math.round((Math.hypot(p.x - last.x, p.y - last.y) / ticks) * 1000) / 1000;
    last = { ...p, t: now };
    driver.move({ ...p, speed });
  });
  const release = () => {
    if (!down) return;
    driver.end();
    down = false;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => (cursor = null));

  // ---- lessons ----
  function open(i: number): void {
    index = i;
    lesson = LESSONS[i];
    world = new World(TUTORIAL_DIMS, TUTORIAL_SEED, defaultParams());
    lesson.build(world);
    driver = new ActionDriver();
    down = false;
    demo = null;
    solved = false;
    fx.attach(world);
    clock.reset();

    const a = activeAbilities(false).find((x) => x.id === lesson.ability);
    hudGlyph.textContent = a?.icon ?? '';
    hudName.textContent = a?.name ?? '';
    stage.style.setProperty('--blade', lineColor(lesson.ability));
    // only this lesson's stroke is on the rack
    for (const card of bar.node.querySelectorAll<HTMLElement>('[data-ability]')) card.style.display = card.dataset.ability === lesson.ability ? '' : 'none';
    bar.select(lesson.ability);
    brushCursor(canvas, world.w, lesson.radius);

    title.replaceChildren(h('span', { class: 'tut-title-num' }, NUMERALS[i]), ` ${lesson.title}`);
    teach.textContent = lesson.teach;
    goalText.textContent = lesson.goal;
    praise.classList.remove('on');
    stepButtons.forEach((b, k) => {
      b.classList.toggle('on', k === i);
      b.classList.toggle('done', done.has(LESSONS[k].ability));
      b.setAttribute('aria-current', k === i ? 'step' : 'false');
    });
    const after = LESSONS[i + 1];
    next.textContent = after ? 'Next lesson' : 'Begin the first scroll';
    next.setAttribute('href', after ? `./tutorial.html?step=${i + 2}` : './level.html?level=level-1');
    next.onclick = after
      ? (e) => {
          e.preventDefault();
          open(i + 1);
        }
      : null;
    showProgress(0);
    history.replaceState(null, '', `?step=${i + 1}`);
  }

  function showProgress(p: number): void {
    goalFill.style.width = `${Math.round(p * 100)}%`;
    goal.classList.toggle('met', p >= 1);
    next.classList.toggle('ready', solved);
  }

  function checkLesson(): void {
    const p = lesson.progress(world);
    showProgress(p);
    if (p < 1 || solved) return;
    solved = true;
    showProgress(p);
    praise.classList.add('on');
    done.add(lesson.ability);
    writeDone(done);
    stepButtons[index].classList.add('done');
  }

  // ---- "Show me": start over and play the lesson's own strokes ----
  function startDemo(): void {
    open(index);
    demo = { stroke: 0, pressAt: world.tick + DEMO_PAUSE, releaseAt: 0, pressed: false };
  }

  /** Called at the top of every tick, before the driver: press and let go on schedule. */
  function runDemo(): void {
    if (!demo) return;
    const s = lesson.solution[demo.stroke];
    if (!demo.pressed && world.tick >= demo.pressAt) {
      driver.begin(lesson.ability, { x: s.from[0], y: s.from[1], speed: 0 }, { radius: lesson.radius });
      demo.pressed = true;
      demo.releaseAt = world.tick + 1 + s.hold;
    } else if (demo.pressed && world.tick >= demo.releaseAt) {
      driver.move({ x: s.to[0], y: s.to[1], speed: 4 });
      driver.end();
      const more = demo.stroke + 1 < lesson.solution.length;
      demo = more ? { stroke: demo.stroke + 1, pressAt: world.tick + DEMO_PAUSE, releaseAt: 0, pressed: false } : null;
    }
  }

  /** The aim line to draw this frame: the player's, or the demo's while it holds. */
  function aimToDraw(): { aim: ReturnType<typeof aimEnd>; charge: number } | null {
    if (!isLineAbility(lesson.ability)) return null;
    if (demo?.pressed) {
      const s = lesson.solution[demo.stroke];
      const held = demo.releaseAt - 1 - s.hold;
      return { aim: aimEnd(s.from[0], s.from[1], s.to[0], s.to[1]), charge: chargeOf(world.tick - held) };
    }
    if (down && cursor) return { aim: aimEnd(pressedAt.x, pressedAt.y, cursor.x, cursor.y), charge: chargeOf(world.tick - pressedTick) };
    return null;
  }

  /** The thing to change, ringed in a dashed vermilion line until the lesson is done. */
  function drawTarget(g: CanvasRenderingContext2D): void {
    if (solved) return;
    const [x0, y0, x1, y1] = lesson.target;
    const pad = 3;
    g.save();
    g.strokeStyle = 'rgba(181, 38, 43, 0.75)';
    g.lineWidth = 1.2 / Math.max(0.5, renderer.scale / 4);
    g.setLineDash([4, 3]);
    g.lineDashOffset = -world.tick / 6;
    g.beginPath();
    g.roundRect(x0 - pad, y0 - pad, x1 - x0 + 1 + pad * 2, y1 - y0 + 1 + pad * 2, 4);
    g.stroke();
    g.restore();
  }

  open(index); // fill the lesson in before the panels are on the page, so they do not animate open
  root.replaceChildren(
    siteHeader('how', 'Tutorial'),
    h(
      'main',
      { class: 'layout level-layout tutorial', id: 'main' },
      stage,
      h(
        'aside',
        { class: 'controls' },
        fixedPanel('Learn the strokes', steps),
        fixedPanel('Lesson', title, teach, goal, bar.node, h('p', { class: 'tut-hint' }, `Drag to aim, hold to charge, release to strike.`), h('div', { class: 'row tut-actions' }, showMe, reset, next)),
      ),
    ),
  );

  if (query.has('show')) startDemo(); // ?step=2&show links straight to the demonstration

  let frames = 0;
  const stop = startLoop(
    clock,
    (dt) => {
      renderer.draw(world, {});
      renderer.inCells((g) => {
        fx.draw(g);
        drawTarget(g);
        const a = aimToDraw();
        if (a) drawAim(g, lesson.ability, a.aim, lesson.radius, a.charge);
      });
      if (frames++ % 10 === 0) checkLesson();
      const text = solved
        ? LESSONS[index + 1]
          ? 'Well done. On to the next stroke.'
          : 'You have learned every stroke. The scrolls are waiting.'
        : demo
          ? 'Watch the stroke…'
          : down && cursor && Math.hypot(cursor.x - pressedAt.x, cursor.y - pressedAt.y) < aimTunables.minLength
            ? 'Drag further to aim.'
            : lesson.goal + '.';
      if (status.textContent !== text) status.textContent = text;
      fx.endFrame(canvas, dt);
    },
    () => fx.shouldAdvance(),
  );
  return () => {
    stop();
    fx.detach();
  };
}

const app = document.getElementById('app');
if (app) mountTutorial(app);
