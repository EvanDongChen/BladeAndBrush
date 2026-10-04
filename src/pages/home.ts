import './bootstrap';
import { activeAbilities } from '../core/abilities';
import { describeGoal } from '../core/goals';
import { levels, type LevelDef } from '../core/levels';
import { lineColor } from '../sim/lineAbility';
import { siteFooter, siteHeader } from './chrome';
import { heroScene } from './heroScene';
import { h, revealOnScroll, seal } from './ui';

/**
 * The landing page: a living landscape as the hero, then how to play (一 二 三), the strokes of the
 * blade, the four scrolls, and the workshop. Reads the level and ability registries; the hero runs
 * the real generator and sim.
 */

const SVG = 'http://www.w3.org/2000/svg';

function svg(tag: string, attrs: Record<string, string | number>, ...kids: SVGElement[]): SVGElement {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...kids);
  return e;
}

/** Layered ink-wash ridges: what the hero shows while the real painting is being generated. */
function inkMountains(): SVGElement {
  const ridge = (d: string, cls: string) => svg('path', { d, class: cls });
  return svg(
    'svg',
    { class: 'ink-mountains', viewBox: '0 0 1200 320', preserveAspectRatio: 'xMidYMax slice' },
    ridge('M0 230 C80 180 130 100 210 130 S320 70 380 120 S500 190 560 150 S700 40 790 100 S930 180 1010 130 S1140 90 1200 140 V320 H0Z', 'ridge far'),
    ridge('M0 270 C60 240 120 160 190 190 S300 240 360 180 S440 90 520 150 S640 260 720 210 S860 120 940 180 S1080 250 1200 200 V320 H0Z', 'ridge mid'),
    ridge('M0 310 C90 280 150 230 240 260 S380 310 470 270 S600 220 700 280 S860 320 960 280 S1120 250 1200 280 V320 H0Z', 'ridge near'),
  );
}

// ---------------------------------------------------------------- hero

function hero(): { node: HTMLElement; destroy(): void } {
  const scene = heroScene(inkMountains());
  const node = h(
    'section',
    { class: 'hero', 'aria-labelledby': 'hero-title' },
    h('div', { class: 'hero-sun', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'hero-copy' },
      h('p', { class: 'hero-kicker' }, h('span', { class: 'kicker-rule', 'aria-hidden': 'true' }), 'A landscape you cut into a poem'),
      h('h1', { class: 'hero-title', id: 'hero-title' }, 'Blade ', h('i', {}, '&'), h('br'), 'Brush'),
      h(
        'p',
        { class: 'hero-lede' },
        'Every scroll paints itself from a seed, in the manner of the old shan shui masters. Read the poem, shape the painting, then take up the blade until the mountains, the water and the sky match the verse.',
      ),
      h(
        'div',
        { class: 'hero-actions' },
        h('a', { class: 'btn btn-seal', href: './level.html?level=level-1' }, h('span', { class: 'btn-glyph', 'aria-hidden': 'true' }, '始'), 'Begin the first scroll'),
        h('a', { class: 'btn btn-ghost', href: '#how' }, 'How it plays'),
      ),
    ),
    h(
      'div',
      { class: 'hero-calligraphy', 'aria-hidden': 'true' },
      h('span', { class: 'hero-glyphs' }, h('span', {}, '斬'), h('span', {}, '山'), h('span', {}, '水')),
      seal('墨客', 'hero-seal'),
    ),
    scene.node,
    h('a', { class: 'scroll-cue', href: '#how', 'aria-label': 'Scroll to how it plays' }, h('span', { 'aria-hidden': 'true' }, '下')),
  );
  return { node, destroy: scene.destroy };
}

// ---------------------------------------------------------------- poem ribbon

function poemRibbon(): HTMLElement {
  const lines = levels.all().flatMap((l) => l.poem);
  const run = () => h('div', { class: 'ribbon-run' }, ...lines.map((line) => h('span', {}, line, h('i', { 'aria-hidden': 'true' }, '◆'))));
  return h('div', { class: 'ribbon', 'aria-hidden': 'true' }, h('div', { class: 'ribbon-track' }, run(), run()));
}

// ---------------------------------------------------------------- how to play

const STEPS: [string, string, string, string][] = [
  ['一', 'yī', 'Read the poem', 'Each scroll opens with a few lines of verse. Every line is a goal: a lone peak, a broken moon, rain on a thirsty village.'],
  ['二', 'èr', 'Shape the painting', 'Tune the mountains, the forest and the wind. The landscape repaints itself as you let go of each slider.'],
  ['三', 'sān', 'Take up the blade', 'Every level gives you a handful of actions. Slash, burn, pour and push until the painting matches the poem.'],
];

function howTo(): HTMLElement {
  return h(
    'section',
    { class: 'section how reveal', id: 'how', 'aria-labelledby': 'how-title' },
    sectionHead('玩法', 'How it plays', 'how-title', 'Three strokes, in order.'),
    h(
      'ol',
      { class: 'steps' },
      ...STEPS.map(([num, pinyin, title, text]) =>
        h(
          'li',
          { class: 'step' },
          h('span', { class: 'step-num', 'aria-hidden': 'true' }, num),
          h('span', { class: 'step-pinyin' }, pinyin),
          h('h3', { class: 'step-title' }, title),
          h('p', { class: 'step-text' }, text),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------- the blade's strokes

const STROKES: Record<string, string> = {
  slash: 'Cuts rock and wood. What you cut loose falls.',
  fire: 'Lights wood and leaves. Flames spread on their own.',
  water: 'Pours a sheet of water that runs downhill.',
  push: 'Hurls loose rock, sand and water along the line.',
  null: 'Quietly erases a strip. No scar, no splatter.',
};

function strokes(): HTMLElement {
  const list = activeAbilities(false);
  return h(
    'section',
    { class: 'section strokes reveal', 'aria-labelledby': 'strokes-title' },
    sectionHead('筆法', 'The strokes of the blade', 'strokes-title', 'Aim a line, hold to charge, release to strike.'),
    h(
      'ul',
      { class: 'stroke-list' },
      ...list.map((a) =>
        h(
          'li',
          { class: 'stroke', style: `--stroke: ${lineColor(a.id)}` },
          h('span', { class: 'stroke-glyph', 'aria-hidden': 'true' }, a.icon ?? a.name.slice(0, 1)),
          h('span', { class: 'stroke-name' }, a.name),
          h('span', { class: 'stroke-text' }, STROKES[a.id] ?? ''),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------- the scrolls

/** Formal numerals for the scroll numbers, as on old ledgers. */
const NUMERALS = ['壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖', '拾'];
const ORDINALS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** The one character each scroll is about. */
const EMBLEM: Record<string, string> = { 'level-1': '峰', 'level-2': '月', 'level-3': '雨', 'level-4': '鳥' };

function scrollCard(l: LevelDef, i: number): HTMLElement {
  const href = `./level.html?level=${encodeURIComponent(l.id)}`;
  return h(
    'article',
    { class: 'scroll-card reveal', style: `--i: ${i}` },
    h('span', { class: 'card-emblem', 'aria-hidden': 'true' }, EMBLEM[l.id] ?? (l.title ?? l.id).slice(0, 1)),
    h('p', { class: 'card-num' }, h('span', { class: 'card-numeral', 'aria-hidden': 'true' }, NUMERALS[i] ?? String(i + 1)), `Scroll ${ORDINALS[i] ?? i + 1}`),
    h('h3', { class: 'card-title' }, h('a', { href }, l.title ?? l.id)),
    h('blockquote', { class: 'card-poem' }, ...l.poem.map((line) => h('span', {}, line))),
    h('ul', { class: 'card-goals', 'aria-label': 'Goals' }, ...l.goals.map((g) => h('li', {}, describeGoal(g)))),
    h(
      'div',
      { class: 'card-foot' },
      h('span', { class: 'card-ink' }, h('span', { class: 'card-ink-glyph', 'aria-hidden': 'true' }, '墨'), `${l.actionBudget} strokes of ink`),
      h('a', { class: 'card-play', href, 'aria-label': `Play ${l.title ?? l.id}` }, 'Unroll', h('span', { 'aria-hidden': 'true' }, ' →')),
    ),
  );
}

function scrolls(): HTMLElement {
  const all = levels.all();
  return h(
    'section',
    { class: 'section scrolls', id: 'levels', 'aria-labelledby': 'levels-title' },
    sectionHead('卷軸', 'The scrolls', 'levels-title', 'Four poems, four paintings. Each one is generated fresh from its seed.'),
    all.length ? h('div', { class: 'scroll-grid' }, ...all.map(scrollCard)) : h('p', {}, 'No scrolls yet.'),
  );
}

// ---------------------------------------------------------------- workshop

const WORKSHOP: [string, string, string, string][] = [
  ['生', 'Generator', './generator.html', 'Seeds, sliders and the painting drawing itself, with the scanner reading it.'],
  ['沙', 'Sandbox', './sandbox.html', 'Every element and ability, freely. Record a session and replay it exactly.'],
  ['藏', 'Gallery', './gallery.html', 'Paintings that matched their poem.'],
];

function workshop(): HTMLElement {
  return h(
    'section',
    { class: 'section workshop-section reveal', 'aria-labelledby': 'workshop-title' },
    sectionHead('工坊', 'The workshop', 'workshop-title', 'Where the paintings are made and taken apart.'),
    h(
      'div',
      { class: 'tiles' },
      ...WORKSHOP.map(([glyph, name, href, text]) =>
        h('a', { class: 'tile', href }, h('span', { class: 'tile-glyph', 'aria-hidden': 'true' }, glyph), h('strong', {}, name), h('span', {}, text)),
      ),
    ),
  );
}

// ---------------------------------------------------------------- pieces

function sectionHead(cn: string, title: string, id: string, sub: string): HTMLElement {
  return h(
    'header',
    { class: 'section-head' },
    h('span', { class: 'section-cn', 'aria-hidden': 'true' }, cn),
    h('h2', { class: 'section-title', id }, title),
    h('p', { class: 'section-sub' }, sub),
  );
}

export function mountHome(root: HTMLElement): () => void {
  const top = hero();
  const main = h('main', { class: 'landing', id: 'main' }, top.node, poemRibbon(), howTo(), strokes(), scrolls(), workshop());
  root.replaceChildren(siteHeader('home'), main, siteFooter());
  revealOnScroll(main);
  return () => top.destroy();
}

const app = document.getElementById('app');
if (app) mountHome(app);
