import './bootstrap';
import type { AbilityArgs, AbilityId } from '../core/abilities';
import { Clock } from '../core/clock';
import { DEFAULT_DIMS } from '../core/constants';
import { El, elements } from '../core/elements';
import { defaultParams, type GenParams } from '../core/params';
import { Renderer } from '../core/render';
import { DEFAULT_ART_K } from '../gen/artState';
import { ActionDriver, type ActionLog } from '../core/replay';
import { World } from '../core/world';
import { artView, type Blueprint } from '../core/blueprint';
import { Frontier } from '../gen/frontier';
import { generate } from '../gen/generate';
import { aimEnd, chargeOf, drawAim, isLineAbility } from '../sim/lineAbility';
import { SCENES } from '../sim/scenes';
import { step } from '../sim/step';
import { Fx } from './fx';
import { tunables } from '../sim/tunables';
import {
  abilityBar,
  brushCursor,
  button,
  displayScale,
  elementPalette,
  h,
  layerToggles,
  pageHeader,
  panel,
  paramSliders,
  registryInspector,
  startLoop,
  toCell,
} from './ui';

/** 'blueprint', 'empty', or the id of one of the hand-built SCENES. */
type Scene = string;

interface Recording {
  seed: number;
  scene: Scene;
  params: GenParams;
  log: ActionLog;
  endTick: number;
  hash: number;
  /** Params or tunables changed mid-recording (they are not in the log). */
  untracked: boolean;
}

/** Person B's test page: paint elements, use abilities, step the sim, record and replay. */
export function mountSandbox(root: HTMLElement): () => void {
  const params = defaultParams();
  let seed = 1;
  let scene: Scene = 'blueprint';
  let world: World;
  let driver = new ActionDriver();

  // current tool: the paint brush with an element, or an ability
  let tool: { ability: AbilityId; el: number } = { ability: 'paint', el: El.ROCK };
  let radius = 4;

  let recordingFrom: Omit<Recording, 'log' | 'endTick' | 'hash'> | null = null;
  let recording: Recording | null = null;

  const canvas = h('canvas', { class: 'grid paintable' });
  const renderer = new Renderer(canvas, DEFAULT_DIMS, displayScale(DEFAULT_DIMS.w, DEFAULT_ART_K));
  canvas.style.imageRendering = 'auto'; // the canvas is k x the grid: smooth it, do not pixelate
  const fx = new Fx(); // blade trails, shake, hit-stop
  const status = h('div', { class: 'status' });
  const recStatus = h('div', { class: 'status' }, 'Not recording.');

  /** The blueprint behind the current world (blueprint scene only): its art is drawn like in the levels. */
  let bp: Blueprint | undefined;

  function buildScene(s: number, sc: Scene, p: GenParams): World {
    const w = new World(DEFAULT_DIMS, s, p);
    bp = undefined;
    if (sc === 'blueprint') {
      bp = generate(s, p);
      new Frontier(bp).revealAll(w);
    } else SCENES.find((x) => x.id === sc)?.build(w);
    return w;
  }

  function reset(): void {
    world = buildScene(seed, scene, params);
    fx.attach(world);
    driver = new ActionDriver();
    clock.reset();
    if (recordingFrom) {
      recordingFrom = null;
      recStatus.textContent = 'Recording cancelled (scene was reset).';
    }
  }

  const tickOnce = () => {
    driver.apply(world);
    step(world);
  };
  const clock = new Clock(tickOnce);
  reset();

  // ---- input -> action driver (applied at the next tick) ----
  const args = (): AbilityArgs => (tool.ability === 'paint' ? { el: tool.el, radius } : { radius });
  let down = false;
  let last = { x: 0, y: 0, t: 0 };
  let pressedAt = { x: 0, y: 0 }; // where the current press started (line abilities aim from here)
  let pressedTick = 0; // sim tick at the press (charge is counted in sim ticks, like the ability does)
  let cursor: { x: number; y: number; r: number } | null = null;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    const p = toCell(canvas, e, renderer.scale);
    down = true;
    pressedAt = p;
    pressedTick = world.tick;
    cursor = { ...p, r: radius };
    last = { ...p, t: performance.now() };
    driver.begin(tool.ability, { ...p, speed: 0 }, args());
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
  const release = () => {
    if (down) driver.end();
    down = false;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => (cursor = null));

  // ---- controls ----
  const seedInput = h('input', { type: 'number', value: seed });
  seedInput.addEventListener('change', () => {
    seed = Number(seedInput.value) | 0;
    reset();
  });
  const sceneSelect = h(
    'select',
    {},
    h('option', { value: 'blueprint' }, 'Blueprint (seed + params)'),
    ...SCENES.map((x) => h('option', { value: x.id }, x.name)),
    h('option', { value: 'empty' }, 'Empty'),
  );
  sceneSelect.addEventListener('change', () => {
    scene = sceneSelect.value as Scene;
    reset();
  });

  const bar = abilityBar((id) => {
    tool = { ability: id, el: tool.el };
    palette.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
  });
  const palette = elementPalette(tool.el, (id) => {
    tool = { ability: 'paint', el: id };
    bar.clear();
  });

  const radiusInput = h('input', { type: 'range', min: 1, max: 24, step: 1, value: radius });
  radiusInput.addEventListener('input', () => {
    radius = Number(radiusInput.value);
    brushCursor(canvas, DEFAULT_DIMS.w, radius);
  });

  const pauseBtn = button('Pause', () => {
    clock.paused = !clock.paused;
    pauseBtn.textContent = clock.paused ? 'Play' : 'Pause';
  });
  const speedSelect = h('select', {}, ...[0.25, 0.5, 1, 2, 4].map((s) => h('option', { value: s, selected: s === 1 }, `${s}x`)));
  speedSelect.addEventListener('change', () => (clock.speed = Number(speedSelect.value)));

  const onParam = (key: string) => {
    world.params[key] = params[key]; // live for behaviors; the blueprint picks it up on Reset
    if (recordingFrom) recordingFrom.untracked = true;
  };

  // live feel knobs from sim/tunables (every behavior and ability registers its own)
  const tuning = h('div', { class: 'registries' });
  for (const g of tunables.all()) {
    const rows = h('div', { class: 'rows' });
    for (const [key, [min, max, stepSize]] of Object.entries(g.ranges)) {
      const out = h('output', {}, String(g.values[key]));
      const input = h('input', { type: 'range', min, max, step: stepSize, value: g.values[key], 'data-tunable': `.${key}` });
      input.addEventListener('input', () => {
        g.values[key] = Number(input.value);
        out.textContent = input.value;
        if (recordingFrom) recordingFrom.untracked = true;
      });
      rows.append(h('label', { class: 'row' }, h('span', {}, key), input, out));
    }
    tuning.append(h('details', {}, h('summary', {}, g.name), rows));
  }

  const record = button('Record', () => {
    reset();
    recordingFrom = { seed, scene, params: { ...params }, untracked: false };
    recording = null;
    recStatus.textContent = 'Recording… (starts from a fresh scene)';
  });
  const stopRec = button('Stop', () => {
    if (!recordingFrom) return;
    if (down) release();
    tickOnce(); // flush queued input so the log is complete
    recording = {
      ...recordingFrom,
      log: JSON.parse(JSON.stringify(driver.log)) as ActionLog,
      endTick: world.tick,
      hash: world.hash(),
    };
    recordingFrom = null;
    recStatus.textContent = `Recorded ${recording.log.length} uses over ${recording.endTick} ticks · hash ${hex(recording.hash)}`;
  });
  const replay = button('Replay', () => {
    const r = recording;
    if (!r) return void (recStatus.textContent = 'Nothing recorded yet.');
    world = buildScene(r.seed, r.scene, r.params);
    fx.detach(); // no effects while fast-forwarding the replay
    driver = new ActionDriver(r.log);
    while (world.tick < r.endTick) tickOnce();
    const got = world.hash();
    const ok = got === r.hash;
    recStatus.textContent =
      `Replayed to tick ${world.tick}: hash ${hex(got)} ${ok ? '✓ matches' : `✗ MISMATCH (expected ${hex(r.hash)})`}` +
      (r.untracked ? ' · params or tuning changed mid-recording, which is not logged' : '');
    driver = new ActionDriver(); // back to live input on the replayed world
    fx.attach(world);
  });

  const counts = h('dl', { class: 'readout' });
  const countCells = new Map<number, HTMLElement>();
  for (const e of elements.all()) {
    const dd = h('dd', { 'data-count': e.id }, '-');
    countCells.set(e.id, dd);
    counts.append(h('dt', {}, e.name), dd);
  }
  const countBuf = new Uint32Array(256);

  root.replaceChildren(
    pageHeader('Sandbox'),
    h(
      'main',
      { class: 'layout' },
      h('div', { class: 'stage' }, canvas, status),
      h(
        'aside',
        { class: 'controls' },
        panel(
          'Scene',
          h('label', { class: 'row' }, h('span', {}, 'Scene'), sceneSelect),
          h('label', { class: 'row' }, h('span', {}, 'Seed'), seedInput),
          button('Reset', reset),
        ),
        panel('Elements', palette, h('label', { class: 'row' }, h('span', {}, 'Brush size'), radiusInput)),
        panel('Abilities', bar.node),
        panel(
          'Sim',
          h('div', { class: 'row' }, pauseBtn, button('Step', () => clock.stepOnce()), speedSelect),
        ),
        panel('Record / replay', h('div', { class: 'row' }, record, stopRec, replay), recStatus),
        panel('Params', paramSliders(params, onParam)),
        panel('Tuning', tuning),
        panel('Cell counts', counts),
        panel('Layers', layerToggles(renderer)),
        panel('Registries', registryInspector()),
      ),
    ),
  );

  let frame = 0;
  const stop = startLoop(
    clock,
    (dt) => {
      renderer.draw(world, { art: bp ? artView(bp) : undefined });
      renderer.inCells((g) => fx.draw(g));
      // skill-shot preview: drawn from live pointer input, so it shows instantly (even when paused)
      if (down && cursor && isLineAbility(tool.ability)) {
        const aim = aimEnd(pressedAt.x, pressedAt.y, cursor.x, cursor.y);
        renderer.inCells((g) => drawAim(g, tool.ability, aim, radius, chargeOf(world.tick - pressedTick)));
      }
      if (frame++ % 15 === 0) {
        world.countByElement(countBuf);
        for (const [id, dd] of countCells) dd.textContent = String(countBuf[id]);
        status.textContent = `tick ${world.tick}${clock.paused ? ' (paused)' : ''} · ${clock.speed}x · tool ${tool.ability}${
          tool.ability === 'paint' ? ` ${elements.get(tool.el)?.name}` : ''
        } · uses ${driver.uses}`;
      }
      fx.endFrame(canvas, dt);
    },
    () => fx.shouldAdvance(), // hit-stop holds the sim for a few frames
  );
  return () => {
    stop();
    fx.detach();
  };
}

const hex = (n: number) => n.toString(16).padStart(8, '0');

const app = document.getElementById('app');
if (app) mountSandbox(app);
