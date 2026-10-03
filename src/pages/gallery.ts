import './bootstrap';
import { getGalleryStore } from '../gallery';
import type { GalleryEntry } from '../gallery';
import { h, handscroll, siteNav } from './ui';

/** Gallery shell. Entries appear here once the play loop can submit wins. */
function entryCard(e: GalleryEntry, onRemove: () => void): HTMLElement {
  const remove = h('button', { type: 'button' }, 'Remove');
  remove.addEventListener('click', () => {
    void getGalleryStore()
      .remove(e.id)
      .then(onRemove);
  });
  const scroll = handscroll(
    e.levelId,
    h('img', { class: 'gallery-thumb', src: e.png, alt: `Winning painting for ${e.levelId}` }),
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
      h('h4', {}, e.levelId),
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
        for (const e of entries) grid.append(entryCard(e, refresh));
      })
      .catch(() => {
        grid.replaceChildren(h('p', {}, 'Could not load the gallery.'));
      });
  };
  root.replaceChildren(
    siteNav('Gallery'),
    h(
      'main',
      { class: 'shell home' },
      h('header', { class: 'page-title' }, h('h2', {}, h('span', { class: 'cn' }, '畫廊'), ' Gallery'), h('p', { class: 'home-note' }, 'Paintings that matched their poem.')),
      grid,
    ),
  );
  refresh();
  return () => {};
}

const app = document.getElementById('app');
if (app) mountGallery(app);
