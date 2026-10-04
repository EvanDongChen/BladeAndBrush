/**
 * Site chrome for the player-facing pages: the sticky ink-and-paper navbar and the footer.
 * The workshop pages (generator, sandbox) keep their own header from ui.ts.
 */
import { h, seal } from './ui';

export type SiteSection = 'home' | 'levels' | 'how' | 'gallery' | 'workshop' | null;

const LINKS: [SiteSection, string, string, string][] = [
  ['how', 'How to play', '玩', './index.html#how'],
  ['levels', 'Scrolls', '卷', './index.html#levels'],
  ['gallery', 'Gallery', '藏', './gallery.html'],
  ['workshop', 'Workshop', '坊', './generator.html'],
];

/** The site's top bar: seal and wordmark on the left, sections on the right. Turns solid once the page scrolls. */
export function siteHeader(active: SiteSection, sub?: string): HTMLElement {
  const nav = h('nav', { class: 'site-nav', 'aria-label': 'Site' });
  for (const [key, label, glyph, href] of LINKS) {
    const a = h('a', { href, class: 'site-link' }, h('span', { class: 'site-link-glyph', 'aria-hidden': 'true' }, glyph), h('span', {}, label));
    if (key === active) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }
  const brand = h(
    'a',
    { class: 'site-brand', href: './index.html', 'aria-label': 'Blade & Brush, home' },
    seal('斬山水', 'site-seal'),
    h('span', { class: 'site-word' }, h('span', { class: 'site-word-en' }, 'Blade', h('i', {}, '&'), 'Brush'), sub ? h('span', { class: 'site-word-sub' }, sub) : ''),
  );
  const bar = h('header', { class: 'site-header' }, h('a', { class: 'skip-link', href: '#main' }, 'Skip to content'), brand, nav);
  // (the guards keep the header usable where there is no window to scroll, such as the DOM test harness)
  const onScroll = () => bar.classList.toggle('scrolled', typeof scrollY === 'number' && scrollY > 24);
  if (typeof addEventListener === 'function') addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  return bar;
}

export type WorkshopPage = 'generator' | 'sandbox';

const WORKSHOP: [WorkshopPage, string, string, string][] = [
  ['generator', '造', 'Generator', './generator.html'],
  ['sandbox', '沙', 'Sandbox', './sandbox.html'],
];

/** The workshop's own tabs (Generator, Sandbox), shown under the site header on those two pages. */
export function workshopTabs(active: WorkshopPage): HTMLElement {
  const nav = h('nav', { class: 'workshop-tabs', 'aria-label': 'Workshop' }, h('span', { class: 'workshop-label' }, '工坊 Workshop'));
  for (const [key, glyph, label, href] of WORKSHOP) {
    const a = h('a', { href, class: 'workshop-tab' }, h('span', { class: 'workshop-tab-glyph', 'aria-hidden': 'true' }, glyph), label);
    if (key === active) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }
  return nav;
}

/** The site footer: a large brushed 山水, the credits and the links. */
export function siteFooter(): HTMLElement {
  return h(
    'footer',
    { class: 'site-footer' },
    h('div', { class: 'footer-mark', 'aria-hidden': 'true' }, '山水'),
    h(
      'div',
      { class: 'footer-cols' },
      h(
        'div',
        {},
        h('p', { class: 'footer-title' }, 'Blade ', h('i', {}, '&'), ' Brush'),
        h('p', { class: 'footer-text' }, 'A landscape that paints itself, and a blade to cut it into the poem.'),
      ),
      h(
        'div',
        {},
        h('p', { class: 'footer-head' }, 'Play'),
        h('a', { href: './level.html?level=level-1' }, 'The first scroll'),
        h('a', { href: './index.html#levels' }, 'All scrolls'),
        h('a', { href: './gallery.html' }, 'Gallery'),
      ),
      h(
        'div',
        {},
        h('p', { class: 'footer-head' }, 'Workshop'),
        h('a', { href: './generator.html' }, 'Generator'),
        h('a', { href: './sandbox.html' }, 'Sandbox'),
      ),
      h(
        'div',
        {},
        h('p', { class: 'footer-head' }, 'Credits'),
        h('p', { class: 'footer-text' }, 'Inspired by ', h('a', { href: 'https://github.com/LingDong-/shan-shui-inf', rel: 'noopener', target: '_blank' }, 'shan-shui-inf'), ' by Lingdong Huang.'),
        h('p', { class: 'footer-text' }, 'Built with Vite, TypeScript and Canvas 2D.'),
      ),
    ),
    h('p', { class: 'footer-base' }, h('span', { 'aria-hidden': 'true' }, '斬山水 · '), 'Every painting is generated from a seed: no two scrolls are alike.'),
  );
}
