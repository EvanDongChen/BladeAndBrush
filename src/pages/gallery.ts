import './bootstrap';
import { getGalleryStore } from '../gallery';
import type { GalleryEntry } from '../gallery';
import { levels } from '../core/levels';
import { h, handscroll } from './ui';
import { siteFooter, siteHeader } from './chrome';

/** The fewest strokes anyone took, per level, among the entries shown (the fastest painters get a seal). */
function fewestStrokes(entries: GalleryEntry[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const e of entries) {
    const n = e.result.strokes;
    if (n !== undefined && n < (best.get(e.levelId) ?? Infinity)) best.set(e.levelId, n);
  }
  return best;
}

/** One painting: the level, who painted it (a random two-word name), and how many strokes it took. */
function entryCard(e: GalleryEntry, fewest: number | undefined, onRemove: () => void): HTMLElement {
  const title = levels.get(e.levelId)?.title ?? e.levelId;
  const strokes = e.result.strokes;
  const quickest = strokes !== undefined && strokes === fewest;
  const remove = h('button', { type: 'button' }, 'Remove');
  remove.addEventListener('click', () => {
    void getGalleryStore()
      .remove(e.id)
      .then(onRemove);
  });
  const scroll = handscroll(
    title,
    h('img', { class: 'gallery-thumb', src: e.png, alt: `Winning painting for ${title}` }),
  );
  // Unroll a moment after it lands on the page.
  window.setTimeout(scroll.open, 120);
  return h(
    'article',
    { class: 'gallery-entry' },
    scroll.node,
    h(
      'div',
      { class: 'gallery-caption' },
      h('h4', {}, title),
      h('p', { class: 'home-meta' }, 'By ', h('span', { class: 'gallery-alias' }, e.playerName ?? 'anonymous')),
      strokes !== undefined
        ? h(
            'p',
            { class: 'gallery-strokes' },
            h('b', {}, String(strokes)),
            ` ${strokes === 1 ? 'stroke' : 'strokes'}${e.result.budget ? ` of ${e.result.budget}` : ''}`,
            quickest ? h('span', { class: 'gallery-best', title: 'Fewest strokes for this level' }, '最少') : '',
          )
        : '',
      h(
        'p',
        { class: 'home-meta' },
        `${e.result.pass ? 'Completed' : 'Submitted'} · seed ${e.seed} · ${new Date(e.createdAt).toLocaleDateString()}`,
      ),
      remove,
    ),
  );
}

function emptyState(): HTMLElement {
  return h(
    'div',
    { class: 'gallery-empty' },
    h('div', { class: 'empty-glyph', 'aria-hidden': 'true' }, '空'),
    h('p', {}, 'No winning paintings yet.'),
    h(
      'p',
      { class: 'home-note' },
      'Finish a level and it will be submitted here with its seed, settings, and move history.',
    ),
  );
}

export function mountGallery(root: HTMLElement): () => void {
  const grid = h('div', { class: 'gallery-grid' }, h('p', {}, 'Loading…'));
  const refresh = () => {
    void getGalleryStore()
      .list()
      .then((entries) => {
        grid.replaceChildren();
        if (!entries.length) {
          grid.append(emptyState());
          return;
        }
        const fewest = fewestStrokes(entries);
        for (const e of entries) grid.append(entryCard(e, fewest.get(e.levelId), refresh));
      })
      .catch(() => {
        grid.replaceChildren(h('p', {}, 'Could not load the gallery.'));
      });
  };
  root.replaceChildren(
    siteHeader('gallery'),
    h(
      'main',
      { class: 'shell home', id: 'main' },
      h('header', { class: 'page-title' }, h('h2', {}, h('span', { class: 'cn' }, '畫廊'), ' Gallery'), h('p', { class: 'home-note' }, 'Paintings that matched their poem.')),
      grid,
    ),
    siteFooter(),
  );
  refresh();
  return () => {};
}

const app = document.getElementById('app');
if (app) mountGallery(app);
