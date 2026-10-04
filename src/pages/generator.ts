import './bootstrap';
import { artView, type Blueprint } from '../core/blueprint';
import { Clock } from '../core/clock';
import { DEFAULT_DIMS } from '../core/constants';
import { defaultParams } from '../core/params';
import { Renderer } from '../core/render';
import { World } from '../core/world';
import { DEFAULT_ART_K } from '../gen/artState';
import { generate } from '../gen/generate';
import { Frontier } from '../gen/frontier';
import { scan } from '../gen/scan';
import { step } from '../sim/step';
import {
  button,
  featureToggles,
  h,
  layerToggles,
  metricReadout,
  pageHeader,
  panel,
  paramSliders,
  registryInspector,
  startLoop,
} from './ui';

/** Person A's test page: seed + params -> blueprint, revealed left to right, with scan readout. */
export function mountGenerator(root: HTMLElement): () => void {
  const params = defaultParams();
  const toggles: Record<string, boolean> = {};
  let seed = 1;
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

  function rebuild(): void {
    bp = generate(seed, params, { features: toggles });
    world = new World(DEFAULT_DIMS, seed, params);
    frontier = new Frontier(bp, columnsPerTick);
    if (!playback) frontier.revealAll(world);
  }

  const clock = new Clock(() => {
    frontier.advance(world);
    step(world);
  });

  const seedInput = h('input', { type: 'number', value: seed, 'data-seed': '' });
  seedInput.addEventListener('change', () => {
    seed = Number(seedInput.value) | 0;
    rebuild();
  });
  const randomize = button('Randomize', () => {
    seed = Math.floor(Math.random() * 1e9);
    seedInput.value = String(seed);
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

  rebuild();

  root.replaceChildren(
    pageHeader('Generator'),
    h(
      'main',
      { class: 'layout' },
      h('div', { class: 'stage' }, canvas, status),
      h(
        'aside',
        { class: 'controls' },
        panel('Seed', h('div', { class: 'row' }, seedInput, randomize)),
        panel('Params', paramSliders(params, rebuild)),
        panel('Features', featureToggles(toggles, rebuild)),
        panel(
          'Reveal',
          h('label', { class: 'row' }, h('span', {}, 'Mode'), modeSelect),
          h('label', { class: 'row' }, h('span', {}, 'Columns / tick'), colsInput),
          button('Restart', rebuild),
        ),
        panel('Scan', readout.node),
        panel('Layers', layerToggles(renderer)),
        panel('Registries', registryInspector()),
      ),
    ),
  );

  let frame = 0;
  const stop = startLoop(clock, () => {
    renderer.draw(world, { frontierX: frontier.done ? undefined : frontier.x, art: artView(bp) });
    if (frame++ % 10 === 0) {
      readout.update(scan(world));
      status.textContent = `seed ${seed} · tick ${world.tick} · frontier ${frontier.x}/${bp.w} · strokes ${bp.registry.strokes.size}`;
    }
  });
  return stop;
}

const app = document.getElementById('app');
if (app) mountGenerator(app);
