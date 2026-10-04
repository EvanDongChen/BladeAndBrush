import './bootstrap';
import type { AbilityId } from '../core/abilities';
import { artView, type Blueprint } from '../core/blueprint';
import { Clock } from '../core/clock';
import type { LevelDims } from '../core/constants';
import { defaultParams, params as paramDefs, type GenParams } from '../core/params';
import { Renderer } from '../core/render';
import { ActionDriver } from '../core/replay';
import { World } from '../core/world';
import { DEFAULT_ART_K } from '../gen/artState';
import { Frontier } from '../gen/frontier';
import { scan } from '../gen/scan';
import { aimEnd, aimTunables, chargeOf, drawAim, isLineAbility, lineColor } from '../sim/lineAbility';
import { step } from '../sim/step';
import { arsenal } from './arsenal';
import { siteHeader } from './chrome';
import { Fx } from './fx';
import { generateAsync } from './genClient';
import { gravityPad, type GravityPad } from './gravityPad';
import { noiseGraph, type NoiseGraph } from './noiseGraph';
import { brushCursor, button, displayScale, fixedPanel, h, startLoop, toCell } from './ui';
import { windPad, type WindPad } from './windPad';
import { LESSONS, TUTORIAL_DIMS, TUTORIAL_SEED, type GraphLesson, type Lesson, type NatureLesson, type StrokeLesson } from './tutorialLessons';

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const DONE_KEY = 'bb-tutorial-done';
/** Ticks before "Show me" starts its first stroke, and between strokes. */
const DEMO_PAUSE = 40;
/** How long "Show me" takes to turn a Nature knob, ms. */
const TURN_MS = 1200;
/** Colours (r, g, b) for the lessons that are not strokes of the blade. */
const TINT = { wind: '79, 122, 108', gravity: '125, 106, 63', graph: '181, 38, 43' };

/** What a finished lesson is remembered by (strokes by their ability id, as before). */
const keyOf = (l: Lesson) => (l.kind === 'stroke' ? (l.id ?? l.ability) : l.kind === 'nature' ? l.control : 'graph');
const tintOf = (l: Lesson) => (l.kind === 'stroke' ? lineColor(l.ability) : l.kind === 'nature' ? TINT[l.control] : TINT.graph);

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
interface StrokeDemo {
  stroke: number;
  pressAt: number;
  releaseAt: number;
  pressed: boolean;
}

/** "Show me" turning a Nature knob: from where it was to the lesson's setting. */
interface TurnDemo {
  from: { gravity: number; wind: number; windY: number };
  t: number;
}

/**
 * The tutorial: one lesson at a time. The strokes of the blade and the Nature panel's knobs each
 * get a small scene built to show what they do best (push a boulder off a ledge, blow a pond over
 * its bank, pour water up into the sky...); the mountain graph gets a real generated painting.
 * "Show me" plays the lesson's own solution, and the next lesson opens once it is done.
 */
export function mountTutorial(root: HTMLElement): () => void {
  const done = readDone();
  const query = new URLSearchParams(location.search);
  const fromUrl = Number(query.get('step')) - 1;
  let index = LESSONS[fromUrl] ? fromUrl : Math.max(0, LESSONS.findIndex((l) => !done.has(keyOf(l))));
  let lesson: Lesson = LESSONS[index];
  let dims: LevelDims = TUTORIAL_DIMS;
  let world = new World(dims, TUTORIAL_SEED, defaultParams());
  let driver = new ActionDriver();
  let solved = false;
  let strokeDemo: StrokeDemo | null = null;
  let turnDemo: TurnDemo | null = null;
  // the mountain graph lesson: its painting, the reveal, and the generator request in flight
  let bp: Blueprint | null = null;
  let frontier: Frontier | null = null;
  let pending = 0;
  let scanned: World | null = null;
  let graphParams: GenParams = defaultParams();

  const canvas = h('canvas', { class: 'grid paintable' });
  let renderer = new Renderer(canvas, dims, displayScale(dims.w, DEFAULT_ART_K));
  canvas.style.imageRendering = 'auto';
  const fx = new Fx();
  const clock = new Clock(() => {
    runStrokeDemo();
    driver.apply(world);
    frontier?.advance(world);
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
    h('div', { class: 'hud-left' }, hudTool), // top left, like the level page
    praise,
    h('span', { class: 'roll', 'aria-hidden': 'true' }),
    h('span', { class: 'roll lead', 'aria-hidden': 'true' }),
  );
  const status = h('div', { class: 'status' });
  const stage = h('div', { class: 'stage' }, frame, status);

  // ---- the lesson panel ----
  const steps = h('ol', { class: 'tut-steps', 'aria-label': 'Lessons' });
  const stepButtons = LESSONS.map((l, i) => {
    const b = h(
      'button',
      { type: 'button', class: 'tut-step', style: `--blade: ${tintOf(l)}` },
      h('span', { class: 'tut-step-num', 'aria-hidden': 'true' }, NUMERALS[i]),
      h('span', { class: 'tut-step-glyph', 'aria-hidden': 'true' }, l.glyph),
      h('span', { class: 'tut-step-name' }, l.name),
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
  /** The stroke picked on the rack (a lesson may offer more than one, e.g. rain: water, then fire). */
  let picked: AbilityId = '';
  /** Open the lesson card again (set once the card exists; a new lesson always starts unfolded). */
  let unfold = () => {};
  const bar = arsenal((id) => {
    picked = id;
    stage.style.setProperty('--blade', lineColor(id));
  });
  const hint = h('p', { class: 'tut-hint' });
  /** Where the lesson's control goes: the stroke's card, a Nature knob, or the mountain graph. */
  const tool = h('div', { class: 'tut-tool' });
  const showMe = button('Show me', () => startDemo());
  const reset = button('Reset', () => open(index));
  const next = h('a', { class: 'home-cta tut-next' });
  let gravity: GravityPad | null = null;
  let wind: WindPad | null = null;
  let graph: NoiseGraph | null = null;

  // ---- pointer input -> action driver (stroke lessons only) ----
  let down = false;
  let last = { x: 0, y: 0, t: 0 };
  let pressedAt = { x: 0, y: 0 };
  let pressedTick = 0;
  let cursor: { x: number; y: number } | null = null;
  const strokeLesson = (): StrokeLesson | null => (lesson.kind === 'stroke' ? lesson : null);

  canvas.addEventListener('pointerdown', (e) => {
    const l = strokeLesson();
    if (!l || strokeDemo) return;
    canvas.setPointerCapture?.(e.pointerId);
    const p = toCell(canvas, e, renderer.scale);
    down = true;
    pressedAt = p;
    pressedTick = world.tick;
    cursor = p;
    last = { ...p, t: performance.now() };
    driver.begin(picked || l.ability, { ...p, speed: 0 }, { radius: l.radius });
  });
  canvas.addEventListener('pointermove', (e) => {
    const l = strokeLesson();
    if (!l) return;
    const p = toCell(canvas, e, renderer.scale);
    cursor = p;
    brushCursor(canvas, world.w, l.radius);
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
  function setDims(next: LevelDims): void {
    if (next.w === dims.w && next.h === dims.h) return;
    dims = next;
    renderer = new Renderer(canvas, dims, displayScale(dims.w, DEFAULT_ART_K));
  }

  /** A fresh hand-built scene for a stroke or Nature lesson. */
  function buildScene(l: StrokeLesson | NatureLesson): void {
    setDims(TUTORIAL_DIMS);
    world = new World(TUTORIAL_DIMS, TUTORIAL_SEED, defaultParams());
    l.build(world);
    bp = null;
    frontier = null;
    fx.attach(world);
  }

  function open(i: number): void {
    index = i;
    lesson = LESSONS[i];
    pending = 0;
    driver = new ActionDriver();
    down = false;
    strokeDemo = null;
    turnDemo = null;
    solved = false;
    scanned = null;
    gravity = wind = graph = null;
    tool.replaceChildren();
    hudGlyph.textContent = lesson.glyph;
    hudName.textContent = lesson.name;
    stage.style.setProperty('--blade', tintOf(lesson));
    canvas.classList.toggle('paintable', lesson.kind === 'stroke');
    canvas.style.cursor = lesson.kind === 'stroke' ? '' : 'default';

    if (lesson.kind === 'stroke') {
      buildScene(lesson);
      const l = lesson;
      // only this lesson's stroke is on the rack
      // only this lesson's strokes are on the rack
      const offered = [l.ability, ...(l.also ?? [])];
      for (const card of bar.node.querySelectorAll<HTMLElement>('[data-ability]')) card.style.display = offered.includes(card.dataset.ability ?? '') ? '' : 'none';
      bar.select(l.ability);
      brushCursor(canvas, world.w, l.radius);
      tool.append(bar.node);
      hint.textContent = 'Drag to aim, hold to charge, release to strike.';
    } else if (lesson.kind === 'nature') {
      buildScene(lesson);
      const p = world.params;
      if (lesson.control === 'gravity') {
        const def = paramDefs.get('gravity');
        gravity = gravityPad(p.gravity, { min: -6, max: def?.max ?? 8, normal: def?.default ?? 2 }, (v) => (world.params.gravity = v));
        tool.append(h('div', { class: 'nature' }, gravity.node));
      } else {
        wind = windPad({ x: p.wind ?? 0, y: p.windY ?? 0 }, (x, y) => {
          world.params.wind = x;
          world.params.windY = y;
        });
        tool.append(h('div', { class: 'nature' }, wind.node));
      }
      hint.textContent = 'Nature acts on the painting as it lives: drag the knob and watch.';
    } else {
      openGraph(lesson);
      hint.textContent = 'Shape the plan, then press Redraw to paint it.';
    }

    title.replaceChildren(h('span', { class: 'tut-title-num' }, NUMERALS[i]), ` ${lesson.title}`);
    teach.textContent = lesson.teach;
    goalText.textContent = lesson.goal;
    praise.classList.remove('on');
    unfold();
    stepButtons.forEach((b, k) => {
      b.classList.toggle('on', k === i);
      b.classList.toggle('done', done.has(keyOf(LESSONS[k])));
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
    clock.reset();
    history.replaceState(null, '', `?step=${i + 1}`);
  }

  // ---- the mountain graph lesson: a real painting, shaped with the graph and redrawn ----
  function openGraph(l: GraphLesson): void {
    setDims(l.dims);
    graphParams = { ...defaultParams(), ...l.params } as GenParams;
    world = new World(l.dims, l.seed, graphParams);
    bp = null;
    frontier = null;
    fx.attach(world);
    graph = noiseGraph({ seed: () => l.seed, params: graphParams, dims: l.dims, setpieces: () => [], onRedraw: () => paintGraph(l) });
    tool.append(graph.node);
    paintGraph(l);
  }

  function paintGraph(l: GraphLesson): void {
    const id = ++pending;
    const planHeights = graph?.edits().heights ?? {};
    generateAsync(l.seed, { ...graphParams }, { planHeights }, renderer.scale).then((next) => {
      if (id !== pending || lesson !== l) return; // a newer redraw, or another lesson, took over
      pending = 0;
      bp = next;
      world = new World(l.dims, l.seed, { ...graphParams });
      frontier = new Frontier(next);
      scanned = null;
      fx.attach(world);
      clock.reset();
    });
  }

  function showProgress(p: number): void {
    goalFill.style.width = `${Math.round(p * 100)}%`;
    goal.classList.toggle('met', p >= 1);
    next.classList.toggle('ready', solved);
  }

  function checkLesson(): void {
    let p: number;
    if (lesson.kind === 'graph') {
      // judged once per painting, when it has finished unrolling
      if (!frontier?.done || pending || scanned === world) return;
      scanned = world;
      p = lesson.progress(scan(world));
    } else {
      p = lesson.progress(world);
    }
    showProgress(solved ? 1 : p);
    if (p < 1 || solved) return;
    solved = true;
    showProgress(1);
    praise.classList.add('on');
    done.add(keyOf(lesson));
    writeDone(done);
    stepButtons[index].classList.add('done');
  }

  // ---- "Show me": start over and play the lesson's own solution ----
  function startDemo(): void {
    open(index);
    if (lesson.kind === 'stroke') {
      strokeDemo = { stroke: 0, pressAt: world.tick + (lesson.solution[0].wait ?? DEMO_PAUSE), releaseAt: 0, pressed: false };
    } else if (lesson.kind === 'nature') {
      const p = world.params;
      turnDemo = { from: { gravity: p.gravity, wind: p.wind ?? 0, windY: p.windY ?? 0 }, t: 0 };
    } else {
      // raise the Height slider to the solution and redraw, as if the player had dragged it
      graphParams.mountainHeight = lesson.solution.mountainHeight;
      graph?.reset();
      paintGraph(lesson);
    }
  }

  /** Called at the top of every tick, before the driver: press and let go on schedule. */
  function runStrokeDemo(): void {
    const l = strokeLesson();
    if (!strokeDemo || !l) return;
    const s = l.solution[strokeDemo.stroke];
    if (!strokeDemo.pressed && world.tick >= strokeDemo.pressAt) {
      bar.select(s.ability ?? l.ability); // the demonstration picks the card, as a player would
      driver.begin(s.ability ?? l.ability, { x: s.from[0], y: s.from[1], speed: 0 }, { radius: l.radius });
      strokeDemo.pressed = true;
      strokeDemo.releaseAt = world.tick + 1 + s.hold;
    } else if (strokeDemo.pressed && world.tick >= strokeDemo.releaseAt) {
      driver.move({ x: s.to[0], y: s.to[1], speed: 4 });
      driver.end();
      const more = strokeDemo.stroke + 1 < l.solution.length;
      strokeDemo = more ? { stroke: strokeDemo.stroke + 1, pressAt: world.tick + (l.solution[strokeDemo.stroke + 1].wait ?? DEMO_PAUSE), releaseAt: 0, pressed: false } : null;
    }
  }

  /** Turn the knob a little further toward the lesson's setting (once per frame). */
  function runTurnDemo(dt: number): void {
    if (!turnDemo || lesson.kind !== 'nature') return;
    turnDemo.t = Math.min(1, turnDemo.t + dt / TURN_MS);
    const e = 1 - (1 - turnDemo.t) ** 3;
    const to = lesson.solution;
    const lerp = (a: number, b: number | undefined) => (b === undefined ? a : a + (b - a) * e);
    const g = Math.round(lerp(turnDemo.from.gravity, to.gravity));
    const x = lerp(turnDemo.from.wind, to.wind);
    const y = lerp(turnDemo.from.windY, to.windY);
    world.params.gravity = g;
    world.params.wind = x;
    world.params.windY = y;
    gravity?.set(g);
    wind?.set(x, y);
    if (turnDemo.t >= 1) turnDemo = null;
  }

  /** The aim line to draw this frame: the player's, or the demo's while it holds. */
  function aimToDraw(): { ability: string; aim: ReturnType<typeof aimEnd>; r: number; charge: number } | null {
    const l = strokeLesson();
    if (!l || !isLineAbility(picked || l.ability)) return null;
    if (strokeDemo?.pressed) {
      const s = l.solution[strokeDemo.stroke];
      const held = strokeDemo.releaseAt - 1 - s.hold;
      return { ability: s.ability ?? l.ability, aim: aimEnd(s.from[0], s.from[1], s.to[0], s.to[1]), r: l.radius, charge: chargeOf(world.tick - held) };
    }
    if (down && cursor) return { ability: picked || l.ability, aim: aimEnd(pressedAt.x, pressedAt.y, cursor.x, cursor.y), r: l.radius, charge: chargeOf(world.tick - pressedTick) };
    return null;
  }

  /** The thing to change, ringed in a dashed vermilion line until the lesson is done. */
  function drawTarget(g: CanvasRenderingContext2D): void {
    if (solved || lesson.kind === 'graph') return;
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

  // the lesson card sits inside the scroll, top right; it folds down to its title to show the painting
  const fold = h('button', { type: 'button', class: 'tut-fold', 'aria-expanded': 'true', title: 'Fold the lesson away' }, '–');
  const body = h('div', { class: 'tut-card-body' }, teach, goal, tool, hint, h('div', { class: 'row tut-actions' }, showMe, reset, next));
  const card = h('section', { class: 'tut-card', 'aria-label': 'Lesson' }, h('div', { class: 'tut-card-head' }, title, fold), body);
  const setFolded = (folded: boolean) => {
    card.classList.toggle('folded', folded);
    fold.textContent = folded ? '+' : '–';
    fold.title = folded ? 'Open the lesson' : 'Fold the lesson away';
    fold.setAttribute('aria-expanded', String(!folded));
  };
  unfold = () => setFolded(false);
  fold.addEventListener('click', () => setFolded(!card.classList.contains('folded')));
  frame.append(card);

  open(index); // fill the lesson in before the card is on the page, so it does not animate open
  root.replaceChildren(
    siteHeader('how', 'Tutorial'),
    h('main', { class: 'layout tutorial-layout', id: 'main' }, h('nav', { class: 'tut-lessons', 'aria-label': 'Lessons' }, fixedPanel('Lessons', steps)), stage),
  );
  (graph as NoiseGraph | null)?.sync(); // the graph's canvas has a size now that it is on the page
  if (query.has('show')) startDemo(); // ?step=2&show links straight to the demonstration

  let frames = 0;
  const stop = startLoop(
    clock,
    (dt) => {
      runTurnDemo(dt);
      renderer.draw(world, { frontierX: frontier && !frontier.done ? frontier.x : undefined, art: bp ? artView(bp) : undefined });
      renderer.inCells((g) => {
        fx.draw(g);
        drawTarget(g);
        const a = aimToDraw();
        if (a) drawAim(g, a.ability, a.aim, a.r, a.charge);
      });
      gravity?.frame(dt);
      wind?.frame(dt);
      if (frames++ % 10 === 0) checkLesson();
      const text = solved
        ? LESSONS[index + 1]
          ? 'Well done. On to the next lesson.'
          : 'You have learned everything. The scrolls are waiting.'
        : pending
          ? 'Grinding the ink…'
          : frontier && !frontier.done
            ? 'The landscape is painting itself…'
            : strokeDemo || turnDemo
              ? 'Watch…'
              : down && cursor && Math.hypot(cursor.x - pressedAt.x, cursor.y - pressedAt.y) < aimTunables.minLength
                ? 'Drag further to aim.'
                : lesson.goal + '.';
      if (status.textContent !== text) status.textContent = text;
      fx.endFrame(canvas, dt);
    },
    () => !pending && fx.shouldAdvance(),
  );
  return () => {
    stop();
    fx.detach();
  };
}

const app = document.getElementById('app');
if (app) mountTutorial(app);
