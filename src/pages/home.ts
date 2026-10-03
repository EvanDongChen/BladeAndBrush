import './bootstrap';
import { describeGoal } from '../core/goals';
import { levels, type LevelDef } from '../core/levels';
import { h, handscroll, hangingScroll, revealOnScroll, siteNav, type ScrollHandle } from './ui';

/**
 * Home landing page. Presentational only: reads the level registry,
 * never touches World, frontier, or abilities (those land with integration).
 */

const SVG = 'http://www.w3.org/2000/svg';

function svg(tag: string, attrs: Record<string, string | number>, ...kids: SVGElement[]): SVGElement {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...kids);
  return e;
}

/** Layered ink-wash ridges for the hero scroll. Hand-drawn paths, no generator involved. */
function inkMountains(): SVGElement {
  const ridge = (d: string, cls: string) => svg('path', { d, class: cls });
  return svg(
    'svg',
    { class: 'ink-mountains', viewBox: '0 0 1200 360', preserveAspectRatio: 'xMidYMax slice', 'aria-hidden': 'true' },
    svg(
      'defs',
      {},
      svg(
        'linearGradient',
        { id: 'wash', x1: 0, y1: 0, x2: 0, y2: 1 },
        svg('stop', { offset: '0%', 'stop-color': 'currentColor', 'stop-opacity': 0.9 }),
        svg('stop', { offset: '100%', 'stop-color': 'currentColor', 'stop-opacity': 0 }),
      ),
    ),
    ridge('M0 250 C80 200 130 120 210 150 S320 90 380 140 S500 210 560 170 S700 60 790 120 S930 200 1010 150 S1140 110 1200 160 V360 H0Z', 'ridge far'),
    ridge('M0 290 C60 260 120 180 190 210 S300 260 360 200 S440 110 520 170 S640 280 720 230 S860 140 940 200 S1080 270 1200 220 V360 H0Z', 'ridge mid'),
    ridge('M0 330 C90 300 150 250 240 280 S380 330 470 290 S600 240 700 300 S860 340 960 300 S1120 270 1200 300 V360 H0Z', 'ridge near'),
  );
}

function hero(): { node: HTMLElement; scroll: ScrollHandle } {
  const scroll = handscroll(
    'the title scroll',
    inkMountains(),
    h(
      'div',
      { class: 'hero-text' },
      h('h2', { class: 'home-title' }, h('span', { class: 'cn' }, '斬山水'), h('span', { class: 'en' }, 'Blade & Brush')),
      h('p', { class: 'home-tag' }, 'A landscape that paints itself. Cut it until it matches the poem.'),
    ),
  );
  return { node: h('section', { class: 'home-hero' }, scroll.node), scroll };
}

function brushDivider(label: string): HTMLElement {
  return h(
    'div',
    { class: 'brush-divider reveal', 'aria-hidden': 'true' },
    svg('svg', { viewBox: '0 0 400 20', preserveAspectRatio: 'none' }, svg('path', { d: 'M4 12 C80 4 160 16 200 10 S330 4 396 11' })),
    h('span', {}, label),
    svg('svg', { viewBox: '0 0 400 20', preserveAspectRatio: 'none' }, svg('path', { d: 'M4 11 C70 4 170 16 200 10 S320 5 396 12' })),
  );
}

const STEPS: [string, string, string][] = [
  ['讀', 'Read the poem', 'Each level names its goals: peaks, trees, water.'],
  ['觀', 'Watch it paint', 'The generator reveals the scroll left to right.'],
  ['斬', 'Cut it into shape', 'Slash grooves to steer water, burn trees, flood valleys. The scanner reads the cells to judge.'],
];

function howTo(): { node: HTMLElement; scrolls: ScrollHandle[] } {
  const scrolls = STEPS.map(([glyph, title, text], i) =>
    hangingScroll(
      `${i + 1} · ${title}`,
      h('div', { class: 'step-glyph' }, glyph),
      h('p', {}, text),
    ),
  );
  const node = h(
    'section',
    { class: 'home-block how' },
    brushDivider('How it plays'),
    h('div', { class: 'hang-row steps' }, ...scrolls.map((s) => s.node)),
    h(
      'p',
      { class: 'home-note' },
      'The full paint-and-play loop arrives after the generator and abilities branches land. For now, explore the workshops below.',
    ),
  );
  return { node, scrolls };
}

function levelScroll(l: LevelDef): HTMLElement {
  const goals = h('ul', { class: 'home-goals' });
  for (const g of l.goals) goals.append(h('li', {}, describeGoal(g)));
  const poem = h('p', { class: 'poem home-poem' });
  l.poem.forEach((line, i) => {
    if (i) poem.append(h('br'));
    poem.append(line);
  });
  return hangingScroll(
    l.id,
    poem,
    goals,
    h('p', { class: 'home-meta' }, `Ink budget ${l.actionBudget} · seed ${l.seed} · ${l.dims.w}×${l.dims.h}`),
    h(
      'p',
      { class: 'cta-row' },
      h('a', { class: 'home-cta', href: './generator.html' }, 'Preview in Generator'),
      h('a', { class: 'home-cta home-cta-alt', href: './sandbox.html' }, 'Open Sandbox'),
    ),
  ).node;
}

function levelsSection(): HTMLElement {
  const all = levels.all();
  const wrap = h('div', { class: 'hang-row levels' });
  for (const l of all) wrap.append(levelScroll(l));
  if (!all.length) wrap.append(h('p', {}, 'No levels registered yet.'));
  return h(
    'section',
    { class: 'home-block', id: 'levels' },
    brushDivider('Levels'),
    h('p', { class: 'home-note center' }, 'Click a scroll’s roller to unroll it.'),
    wrap,
  );
}

const WORKSHOPS: [string, string, string][] = [
  ['Generator', './generator.html', 'Seed, params, frontier reveal, scan'],
  ['Sandbox', './sandbox.html', 'Elements, abilities, record and replay'],
  ['Gallery', './gallery.html', 'Winning paintings'],
];

function workshops(): HTMLElement {
  const grid = h('div', { class: 'workshops' });
  WORKSHOPS.forEach(([name, href, text], i) =>
    grid.append(
      h(
        'a',
        { class: 'workshop reveal', href, style: `--d:${i * 120}ms` },
        h('strong', {}, name),
        h('span', {}, text),
      ),
    ),
  );
  return h('section', { class: 'home-block' }, brushDivider('Workshops'), grid);
}

function credits(): HTMLElement {
  return h(
    'footer',
    { class: 'home-foot' },
    brushDivider('終'),
    h('p', {}, 'Blade & Brush · built with Vite, TypeScript and Canvas 2D.'),
  );
}

export function mountHome(root: HTMLElement): () => void {
  const top = hero();
  const how = howTo();
  const main = h('main', { class: 'shell home' }, top.node, how.node, levelsSection(), workshops(), credits());
  root.replaceChildren(siteNav('Home'), main);

  // Unroll the title scroll shortly after load, then the three step scrolls one after another.
  const timers: number[] = [];
  timers.push(window.setTimeout(top.scroll.open, 350));
  how.scrolls.forEach((s, i) => timers.push(window.setTimeout(s.open, 1500 + i * 280)));
  revealOnScroll(main);
  return () => timers.forEach((t) => clearTimeout(t));
}

const app = document.getElementById('app');
if (app) mountHome(app);
