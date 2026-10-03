import './bootstrap';
import { describeGoal } from '../core/goals';
import { levels, type LevelDef } from '../core/levels';
import { h, panel } from './ui';

/**
 * Home landing page. Presentational only: reads the level registry,
 * never touches World, frontier, or abilities (those land with integration).
 */
function hero(): HTMLElement {
  return h(
    'section',
    { class: 'home-hero' },
    h('p', { class: 'home-kicker' }, 'Slash · burn · flood · push'),
    h('h2', { class: 'home-title' }, 'Blade & Brush'),
    h('p', { class: 'home-tag' }, 'A living landscape that paints itself. Carve it until it matches the poem.'),
    h('div', { class: 'home-divider', 'aria-hidden': 'true' }, h('span', {}, '·')),
  );
}

function howTo(): HTMLElement {
  return panel(
    'How it plays',
    h(
      'ol',
      { class: 'home-steps' },
      h('li', {}, h('strong', {}, 'Read the poem. '), 'Each level names its goals: peaks, trees, water.'),
      h('li', {}, h('strong', {}, 'Watch it paint. '), 'The generator reveals the scroll left to right.'),
      h(
        'li',
        {},
        h('strong', {}, 'Cut it into shape. '),
        'Slash grooves to steer water, burn trees, flood valleys — the scanner reads the cells to judge.',
      ),
    ),
    h(
      'p',
      { class: 'home-note' },
      'The full paint-and-play loop arrives after the generator and abilities branches land. For now, explore the workshops below.',
    ),
  );
}

function levelCard(l: LevelDef): HTMLElement {
  const goals = h('ul', { class: 'home-goals' });
  for (const g of l.goals) goals.append(h('li', {}, describeGoal(g)));
  const poem = h('p', { class: 'poem home-poem' });
  l.poem.forEach((line, i) => {
    if (i) poem.append(h('br'));
    poem.append(line);
  });
  return h(
    'article',
    { class: 'home-card' },
    h('h4', {}, l.id),
    poem,
    goals,
    h('p', { class: 'home-meta' }, `Ink budget ${l.actionBudget} · seed ${l.seed} · ${l.dims.w}×${l.dims.h}`),
    h(
      'p',
      {},
      h('a', { class: 'home-cta', href: './generator.html' }, 'Preview in Generator'),
      ' ',
      h('a', { class: 'home-cta home-cta-alt', href: './sandbox.html' }, 'Open Sandbox'),
    ),
  );
}

function levelsSection(): HTMLElement {
  const all = levels.all();
  const wrap = h('div', { class: 'home-levels' });
  for (const l of all) wrap.append(levelCard(l));
  if (!all.length) wrap.append(h('p', {}, 'No levels registered yet.'));
  return h(
    'section',
    { class: 'home-block' },
    h('h3', { class: 'home-h' }, 'Levels'),
    wrap,
  );
}

function workshops(): HTMLElement {
  return panel(
    'Workshops',
    h(
      'ul',
      { class: 'home-links' },
      h(
        'li',
        {},
        h('a', { href: './generator.html' }, 'Generator'),
        ': seed, params, frontier reveal, scan',
      ),
      h(
        'li',
        {},
        h('a', { href: './sandbox.html' }, 'Sandbox'),
        ': elements, abilities, record/replay',
      ),
    ),
  );
}

function credits(): HTMLElement {
  return h(
    'footer',
    { class: 'home-foot' },
    h('div', { class: 'home-divider', 'aria-hidden': 'true' }, h('span', {}, '·')),
    h('p', {}, 'Blade & Brush · built with Vite, TypeScript and Canvas 2D.'),
  );
}

export function mountHome(root: HTMLElement): () => void {
  root.replaceChildren(
    h(
      'main',
      { class: 'shell home' },
      hero(),
      howTo(),
      levelsSection(),
      workshops(),
      credits(),
    ),
  );
  return () => {};
}

const app = document.getElementById('app');
if (app) mountHome(app);
