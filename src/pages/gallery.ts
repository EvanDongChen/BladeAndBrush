import './bootstrap';
import { getGalleryStore } from '../gallery';
import type { GalleryEntry } from '../gallery';
import { levels } from '../core/levels';
import { h } from './ui';
import { siteFooter, siteHeader } from './chrome';

/** Which paintings to show: every level, or one. */
type Tab = 'all' | string;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ROD = 18; // roller width in px, matching .pscroll in the stylesheet
const levelTitle = (id: string) => levels.get(id)?.title ?? id;

/** The fewest strokes anyone took, per level, among the entries shown (the fastest painters get a seal). */
function fewestStrokes(entries: GalleryEntry[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const e of entries) {
    const n = e.result.strokes;
    if (n !== undefined && n < (best.get(e.levelId) ?? Infinity)) best.set(e.levelId, n);
  }
  return best;
}

/** The painting's width over its height, known before the picture loads so the scroll has its size straight away. */
function ratioOf(levelId: string): string {
  const dims = levels.get(levelId)?.dims;
  return dims ? `${dims.w} / ${dims.h}` : '960 / 256';
}

/**
 * A painting on a hand scroll that can be rolled open by any amount: --f is how open it is, 0 (shut) to 1
 * (fully open). Shelf scrolls sit partly open in a square; the one being viewed is fully open.
 */
function paintingScroll(e: GalleryEntry, kind: 'thumb' | 'viewing'): HTMLElement {
  const alt = `Painting for ${levelTitle(e.levelId)} by ${e.playerName ?? 'anonymous'}`;
  return h(
    'div',
    { class: `pscroll ${kind}` },
    h('div', { class: 'ps-paper' }, h('img', { src: e.png, alt, draggable: false, style: `aspect-ratio: ${ratioOf(e.levelId)}` })),
    h('span', { class: 'ps-rod left', 'aria-hidden': 'true' }),
    h('span', { class: 'ps-rod right', 'aria-hidden': 'true' }),
  );
}

function strokesLine(e: GalleryEntry, fewest: number | undefined): HTMLElement | string {
  const strokes = e.result.strokes;
  if (strokes === undefined) return '';
  return h(
    'p',
    { class: 'gallery-strokes' },
    h('b', {}, String(strokes)),
    ` ${strokes === 1 ? 'stroke' : 'strokes'}${e.result.budget ? ` of ${e.result.budget}` : ''}`,
    strokes === fewest ? h('span', { class: 'gallery-best', title: 'Fewest strokes for this level' }, '最少') : '',
  );
}

function emptyState(tab: Tab): HTMLElement {
  return h(
    'div',
    { class: 'gallery-empty' },
    h('div', { class: 'empty-glyph', 'aria-hidden': 'true' }, '空'),
    h('p', {}, tab === 'all' ? 'No winning paintings yet.' : `No paintings for ${levelTitle(tab)} yet.`),
    h('p', { class: 'home-note' }, 'Finish a level and sign your painting to hang it here.'),
  );
}

export function mountGallery(root: HTMLElement): () => void {
  let tab: Tab = 'all';
  let current: GalleryEntry | null = null;
  let shelf: GalleryEntry[] = [];
  let fewest = new Map<string, number>();
  let loadSeq = 0;

  const tabs = h('nav', { class: 'gallery-tabs', 'aria-label': 'Levels' });
  const stage = h('section', { class: 'gallery-stage', 'aria-live': 'polite' });
  const shelfEl = h('div', { class: 'gallery-shelf' });
  const status = h('p', { class: 'home-note gallery-status' }, 'Loading…');

  // ---- tabs: All, then one per level ----
  const tabButtons = new Map<Tab, HTMLButtonElement>();
  const addTab = (id: Tab, label: string) => {
    const b = h('button', { type: 'button', class: 'gallery-tab', 'aria-pressed': String(id === tab) }, label);
    b.addEventListener('click', () => {
      if (id !== tab) void load(id);
    });
    tabButtons.set(id, b);
    tabs.append(b);
  };
  addTab('all', 'All');
  for (const l of levels.all()) addTab(l.id, l.title ?? l.id);

  // ---- the painting being viewed, fully open ----
  function stageView(e: GalleryEntry): HTMLElement {
    const remove = h('button', { type: 'button' }, 'Remove');
    remove.addEventListener('click', () => {
      void getGalleryStore()
        .remove(e.id)
        .then(() => load(tab));
    });
    return h(
      'article',
      { class: 'gallery-entry' },
      paintingScroll(e, 'viewing'),
      h(
        'div',
        { class: 'gallery-caption' },
        h('h4', {}, levelTitle(e.levelId)),
        h('p', { class: 'home-meta' }, 'By ', h('span', { class: 'gallery-alias' }, e.playerName ?? 'anonymous')),
        strokesLine(e, fewest.get(e.levelId)),
        h('p', { class: 'home-meta' }, `${e.result.pass ? 'Completed' : 'Submitted'} · seed ${e.seed} · ${new Date(e.createdAt).toLocaleDateString()}`),
        remove,
      ),
    );
  }

  // ---- a painting on the shelf, partly open in a square ----
  function shelfItem(e: GalleryEntry, index: number): HTMLElement {
    const name = e.playerName ?? 'anonymous';
    const strokes = e.result.strokes;
    const b = h(
      'button',
      {
        type: 'button',
        class: 'shelf-item',
        'aria-label': `View ${levelTitle(e.levelId)} by ${name}${strokes !== undefined ? `, ${strokes} strokes` : ''}`,
      },
      paintingScroll(e, 'thumb'),
      h('span', { class: 'shelf-label' }, h('span', { class: 'shelf-name' }, name), strokes !== undefined ? h('span', { class: 'shelf-strokes' }, `${strokes}`) : ''),
      h('span', { class: 'shelf-level' }, levelTitle(e.levelId)),
    );
    b.addEventListener('click', () => view(index));
    return b;
  }

  function renderShelf(): void {
    shelfEl.replaceChildren(...shelf.map((e, i) => shelfItem(e, i)));
  }

  function renderStage(): HTMLElement | null {
    if (!current) {
      stage.replaceChildren();
      return null;
    }
    const article = stageView(current);
    stage.replaceChildren(article);
    return article;
  }

  /**
   * Swap the clicked shelf painting with the one being viewed: it unrolls into the stage from where it
   * sat on the shelf, and the old one takes its place on the shelf.
   */
  function view(index: number): void {
    const chosen = shelf[index];
    const item = shelfEl.children[index] as HTMLElement | undefined;
    if (!chosen || !current || !item) return;
    const thumb = item.querySelector('.pscroll') as HTMLElement;
    const rect = thumb.getBoundingClientRect();
    const docTop = rect.top + window.scrollY;

    const previous = current;
    current = chosen;
    shelf[index] = previous;
    const article = renderStage();
    const swapped = shelfItem(previous, index);
    item.replaceWith(swapped);

    // bring the stage to the top of the page, then unroll the chosen scroll out of the spot it left
    const stageTop = stage.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, stageTop - 90), behavior: 'instant' as ScrollBehavior });
    const scroll = article?.querySelector('.pscroll') as HTMLElement | null;
    if (!scroll || reducedMotion() || typeof scroll.animate !== 'function') return;
    unrollFrom(scroll, { left: rect.left, width: rect.width, height: rect.height, top: docTop - window.scrollY });
    article?.querySelector('.gallery-caption')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 500, easing: 'ease-out', fill: 'backwards' });
    swapped.animate(
      [
        { opacity: 0, transform: 'scale(0.82)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 500, delay: 250, easing: 'ease-out', fill: 'backwards' },
    );
  }

  /** Start the stage scroll shrunk and half rolled where the thumbnail was, then open it into place. */
  function unrollFrom(scroll: HTMLElement, from: { left: number; top: number; width: number; height: number }): void {
    const to = scroll.getBoundingClientRect();
    if (!to.width || !to.height) return;
    const s = from.height / to.height; // the painting is as tall as the thumbnail was
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const f = Math.min(1, Math.max(0.08, (from.width / s - 2 * ROD) / (to.width - 2 * ROD)));
    scroll.style.setProperty('--f', String(f));
    scroll.style.zIndex = '5';
    scroll.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: 'none' }],
      { duration: 850, easing: 'cubic-bezier(0.65, 0, 0.25, 1)' },
    ).onfinish = () => (scroll.style.zIndex = '');
    void scroll.offsetWidth; // settle the half-open start before opening
    scroll.style.setProperty('--f', '1');
  }

  async function load(next: Tab): Promise<void> {
    const mine = ++loadSeq;
    tab = next;
    for (const [id, b] of tabButtons) b.setAttribute('aria-pressed', String(id === tab));
    status.textContent = 'Loading…';
    status.hidden = false;
    try {
      const entries = await getGalleryStore().list(tab === 'all' ? undefined : tab);
      if (mine !== loadSeq) return; // a newer tab was picked meanwhile
      fewest = fewestStrokes(entries);
      current = entries[0] ?? null;
      shelf = entries.slice(1);
      status.hidden = true;
      if (!current) {
        stage.replaceChildren(emptyState(tab));
        shelfEl.replaceChildren();
        return;
      }
      const article = renderStage();
      renderShelf();
      const first = article?.querySelector('.pscroll') as HTMLElement | null;
      if (first && !reducedMotion() && typeof first.animate === 'function') {
        first.style.setProperty('--f', '0.06'); // the newest painting unrolls as the page opens
        void first.offsetWidth;
        first.style.setProperty('--f', '1');
      }
    } catch {
      if (mine !== loadSeq) return;
      stage.replaceChildren();
      shelfEl.replaceChildren();
      status.textContent = 'Could not load the gallery.';
      status.hidden = false;
    }
  }

  root.replaceChildren(
    siteHeader('gallery'),
    h(
      'main',
      { class: 'shell home gallery', id: 'main' },
      h('header', { class: 'page-title' }, h('h2', {}, h('span', { class: 'cn' }, '畫廊'), ' Gallery'), h('p', { class: 'home-note' }, 'Paintings that matched their poem.')),
      tabs,
      status,
      stage,
      shelfEl,
    ),
    siteFooter(),
  );
  void load('all');
  return () => {};
}

const app = document.getElementById('app');
if (app) mountGallery(app);
