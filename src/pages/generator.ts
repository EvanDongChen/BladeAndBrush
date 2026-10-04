import './bootstrap';
import { artView, type Blueprint } from '../core/blueprint';
import { Clock } from '../core/clock';
import { flags } from '../core/config';
import { DEFAULT_DIMS } from '../core/constants';
import { levels } from '../core/levels';
import { defaultParams } from '../core/params';
import { Renderer } from '../core/render';
import type { SetpieceSpec } from '../core/setpieces';
import { World } from '../core/world';
import { DEFAULT_ART_K } from '../gen/artState';
import { generate } from '../gen/generate';
import { Frontier } from '../gen/frontier';
import { scan } from '../gen/scan';
import { siteHeader, workshopTabs } from './chrome';
import { noiseGraph } from './noiseGraph';
import { step } from '../sim/step';
import {
  button,
  featureToggles,
  h,
  layerToggles,
  metricReadout,
  panel,
  paramSliders,
  registryInspector,
  startLoop,
  toCell,
} from './ui';

/** Person A's test page: seed + params -> blueprint, revealed left to right, with scan readout. */
export function mountGenerator(root: HTMLElement): () => void {
  const params = defaultParams();
  const toggles: Record<string, boolean> = {};
  let seed = 1;
  let setpieces: SetpieceSpec[] = [];
  let playback = true;
  let columnsPerTick = 4;

  let bp: Blueprint;
  let world: World;
  let frontier: Frontier;

  const canvas = h('canvas', { class: 'grid' });
  const renderer = new Renderer(canvas, DEFAULT_DIMS, DEFAULT_ART_K);
  // The canvas is k x the grid and gets shrunk to fit: smooth it instead of pixelating.
  canvas.style.imageRendering = 'auto';
  const status = h('div', { class: 'status' });
  const readout = metricReadout();

  // The mountain graph replaces the mountain-height and spacing sliders: its edits are staged in the graph
  // and only reach generate() when its Redraw button is pressed.
  const graph = noiseGraph({
    seed: () => seed,
    params,
    setpieces: () => setpieces,
    onRedraw: () => rebuild(),
  });

  function rebuild(): void {
    bp = generate(seed, params, { features: toggles, setpieces, planHeights: graph.edits().heights });
    world = new World(DEFAULT_DIMS, seed, params);
    frontier = new Frontier(bp, columnsPerTick);
    graph.sync(); // other sliders reshape the planned mountains too
    if (!playback) frontier.revealAll(world);
  }

  const clock = new Clock(() => {
    frontier.advance(world);
    step(world);
  });

  const seedInput = h('input', { type: 'number', value: seed, 'data-seed': '' });
  seedInput.addEventListener('change', () => {
    seed = Number(seedInput.value) | 0;
    graph.reset();
    rebuild();
  });
  const randomize = button('Randomize', () => {
    seed = Math.floor(Math.random() * 1e9);
    seedInput.value = String(seed);
    graph.reset();
    rebuild();
  });

  const modeSelect = h('select', {}, h('option', { value: 'playback' }, 'Playback'), h('option', { value: 'instant' }, 'Instant'));
  modeSelect.addEventListener('change', () => {
    playback = modeSelect.value === 'playback';
    rebuild();
  });
  const colsInput = h('input', { type: 'range', min: 1, max: 32, step: 1, value: columnsPerTick });
  colsInput.addEventListener('input', () => {
    columnsPerTick = Number(colsInput.value);
    frontier.columnsPerTick = columnsPerTick;
  });

  // Dig tool: drag on the painting to break cells (leaves CUT scars, like a slash). Layers behind
  // the cells you break come forward, so you can dig through a near mountain into the mid row.
  let digRadius = 6;
  let digging = false;
  const digOn = h('input', { type: 'checkbox', checked: true });
  const digInput = h('input', { type: 'range', min: 2, max: 30, step: 1, value: digRadius });
  digInput.addEventListener('input', () => (digRadius = Number(digInput.value)));
  const dig = (e: PointerEvent) => {
    if (!digOn.checked) return;
    const p = toCell(canvas, e, renderer.scale);
    world.clearCircle(p.x, p.y, digRadius, { cut: true });
  };
  const farOn = h('input', { type: 'checkbox' });
  farOn.checked = flags.farLayerInteractive;
  farOn.addEventListener('change', () => {
    flags.farLayerInteractive = farOn.checked;
    rebuild();
  });
  const shadersOn = h('input', { type: 'checkbox', checked: true });
  shadersOn.checked = flags.shaders;
  shadersOn.addEventListener('change', () => (flags.shaders = shadersOn.checked));
  canvas.classList.add('paintable');
  canvas.addEventListener('pointerdown', (e) => {
    digging = true;
    canvas.setPointerCapture(e.pointerId);
    dig(e);
  });
  canvas.addEventListener('pointermove', (e) => digging && dig(e));
  const stopDig = () => (digging = false);
  canvas.addEventListener('pointerup', stopDig);
  canvas.addEventListener('pointercancel', stopDig);

  // A level's setpieces (moon, village...) on top of the free painting, with its seed and params.
  const sliders = paramSliders(params, rebuild, { exclude: ['mountainHeight', 'spacing'] });
  const levelSelect = h(
    'select',
    {},
    h('option', { value: '' }, 'Free painting'),
    ...levels.all().map((l) => h('option', { value: l.id }, l.title ?? l.id)),
  );
  levelSelect.addEventListener('change', () => {
    const l = levels.get(levelSelect.value);
    setpieces = l?.setpieces ?? [];
    if (l) {
      seed = l.seed;
      seedInput.value = String(seed);
      graph.reset();
      for (const [key, p] of Object.entries(l.params)) {
        params[key] = p.value;
        const input = sliders.querySelector<HTMLInputElement>(`[data-param="${key}"]`);
        if (input) {
          input.value = String(p.value);
          if (input.nextElementSibling) input.nextElementSibling.textContent = String(p.value);
        }
      }
    }
    graph.sync();
    rebuild();
  });

  rebuild();

  root.replaceChildren(
    siteHeader('workshop', 'Generator'),
    workshopTabs('generator'),
    h(
      'main',
      { class: 'layout', id: 'main' },
      h('div', { class: 'stage' }, canvas, status),
      h(
        'aside',
        { class: 'controls' },
        panel('Seed', h('div', { class: 'row' }, seedInput, randomize), h('label', { class: 'row' }, h('span', {}, 'Level'), levelSelect)),
        panel('Mountains', graph.node),
        panel('Params', sliders),
        panel('Features', featureToggles(toggles, rebuild)),
        panel(
          'Reveal',
          h('label', { class: 'row' }, h('span', {}, 'Mode'), modeSelect),
          h('label', { class: 'row' }, h('span', {}, 'Columns / tick'), colsInput),
          button('Restart', rebuild),
        ),
        panel(
          'Dig (test layers)',
          h('label', { class: 'row' }, h('span', {}, 'Drag to dig'), digOn),
          h('label', { class: 'row' }, h('span', {}, 'Radius'), digInput),
          h('label', { class: 'row' }, h('span', {}, 'Far ridges interactive'), farOn),
          h('label', { class: 'row' }, h('span', {}, 'Shaders (water, fire, loose pieces)'), shadersOn),
          h('p', { class: 'home-note' }, 'Breaks cells; the layer behind comes forward. Restart (or change a slider) to refill.'),
        ),
        panel('Scan', readout.node),
        panel('Layers', layerToggles(renderer)),
        panel('Registries', registryInspector()),
      ),
    ),
  );

  let frame = 0;
  graph.sync(); // canvas has layout now; draw at full column width
  const stop = startLoop(clock, () => {
    renderer.draw(world, { frontierX: frontier.done ? undefined : frontier.x, art: artView(bp) });
    if (frame++ % 10 === 0) {
      readout.update(scan(world));
      status.textContent = `seed ${seed} · tick ${world.tick} · frontier ${frontier.x}/${bp.w} · objects ${world.objects.size}/${bp.registry.strokes.size}`;
    }
  });
  return stop;
}

const app = document.getElementById('app');
if (app) mountGenerator(app);
