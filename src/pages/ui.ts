/**
 * Shared DOM helpers for the test pages. Every list here is built from a registry, so a newly
 * dropped-in element/ability/param/layer/metric shows up without touching page code.
 */
import { activeAbilities, type AbilityId } from '../core/abilities';
import { audio } from '../audio/engine';
import type { Clock } from '../core/clock';
import { flagOn } from '../core/config';
import { elements } from '../core/elements';
import { features } from '../core/features';
import { params, type GenParams } from '../core/params';
import { ALL_REGISTRIES, byOrder } from '../core/registry';
import { layers, type Renderer } from '../core/render';
import { metrics, type ScanResult } from '../core/scan';
import { perf, perfEnabled } from './perf';

type Attrs = Record<string, string | number | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : String(v));
  }
  e.append(...children);
  return e;
}

let panelSeq = 0;

/**
 * A control panel styled as a small hanging scroll. Clicking the title rolls it up or down;
 * the contents stay in the DOM either way, so registry-driven queries keep working.
 */
export function panel(title: string, ...children: (Node | string)[]): HTMLElement {
  const id = `panel-${++panelSeq}`;
  const toggle = h('button', { type: 'button', class: 'panel-toggle', 'aria-expanded': 'true', 'aria-controls': id }, title);
  const body = h('div', { class: 'panel-body', id }, h('div', { class: 'panel-inner' }, ...children));
  const section = h('section', { class: 'panel' }, h('h3', {}, toggle), body);
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    section.classList.toggle('rolled', !open);
  });
  return section;
}

/** A panel that always stays open: the same look as panel(), with a plain heading instead of a toggle. */
export function fixedPanel(title: string, ...children: (Node | string)[]): HTMLElement {
  return h(
    'section',
    { class: 'panel' },
    h('h3', {}, h('span', { class: 'panel-toggle panel-fixed' }, title)),
    h('div', { class: 'panel-body' }, h('div', { class: 'panel-inner' }, ...children)),
  );
}

export function button(label: string, onClick: () => void, attrs: Attrs = {}): HTMLButtonElement {
  const b = h('button', { type: 'button', ...attrs }, label);
  b.addEventListener('click', onClick);
  return b;
}

/** The red square seal used as the site logo. */
export function seal(text = '斬山水', extra = ''): HTMLElement {
  const s = h('span', { class: `seal ${extra}`.trim(), 'aria-hidden': 'true' });
  for (const ch of text) s.append(h('span', {}, ch));
  return s;
}

/** A header button that mutes and unmutes the music: 音 (sound) when on, 靜 (still) when off. */
export function soundToggle(): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'sound-toggle' });
  const sync = () => {
    const on = !audio.muted;
    const waiting = on && !audio.running; // the browser holds sound until the page is clicked
    b.textContent = on ? '音' : '靜';
    b.classList.toggle('waiting', waiting);
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', waiting ? 'Click anywhere to start the music.' : on ? 'Sound on. Click to mute.' : 'Sound off. Click to turn on.');
    b.title = waiting ? 'Click anywhere to start the music' : on ? 'Mute' : 'Sound on';
  };
  b.addEventListener('click', () => audio.toggle());
  audio.onChange(sync);
  sync();
  return b;
}

/** Wooden roller with end caps, shared by both scroll kinds. */
function rod(cls: string): HTMLElement {
  return h('span', { class: `rod ${cls}`, 'aria-hidden': 'true' });
}

export interface ScrollHandle {
  node: HTMLElement;
  open(): void;
  close(): void;
  toggle(): void;
}

function scrollHandle(node: HTMLElement, onChange?: (open: boolean) => void): ScrollHandle {
  const set = (open: boolean) => {
    node.classList.toggle('open', open);
    node.querySelectorAll(':scope > .scroll-toggle').forEach((b) => b.setAttribute('aria-expanded', String(open)));
    onChange?.(open);
  };
  return {
    node,
    open: () => set(true),
    close: () => set(false),
    toggle: () => set(!node.classList.contains('open')),
  };
}

/**
 * A horizontal hand scroll (手卷): two rollers that slide apart and unroll the paper between them.
 * Starts rolled; call `open()` (or click a roller) to unroll it.
 */
export function handscroll(label: string, ...children: (Node | string)[]): ScrollHandle {
  const node = h('div', { class: 'handscroll' });
  const left = h('button', { type: 'button', class: 'scroll-toggle rod-btn left', 'aria-label': `Roll or unroll ${label}`, 'aria-expanded': 'false' }, rod('v'));
  const right = h('button', { type: 'button', class: 'scroll-toggle rod-btn right', 'aria-label': `Roll or unroll ${label}`, 'aria-expanded': 'false' }, rod('v'));
  node.append(h('div', { class: 'handscroll-paper' }, h('div', { class: 'handscroll-inner' }, ...children)), left, right);
  const handle = scrollHandle(node);
  left.addEventListener('click', handle.toggle);
  right.addEventListener('click', handle.toggle);
  return handle;
}

/**
 * A vertical hanging scroll (立轴): click the top roller and the paper rolls down, weighted by the
 * bottom roller. `title` is written on the brocade band so a closed scroll is still labelled.
 */
export function hangingScroll(title: string, ...children: (Node | string)[]): ScrollHandle {
  const node = h('article', { class: 'hanging' });
  const top = h(
    'button',
    { type: 'button', class: 'scroll-toggle hanging-top', 'aria-expanded': 'false' },
    rod('h'),
    h('span', { class: 'hanging-title' }, title),
  );
  node.append(
    h('span', { class: 'hanging-cord', 'aria-hidden': 'true' }),
    top,
    h('div', { class: 'hanging-body' }, h('div', { class: 'hanging-inner' }, ...children)),
    rod('h bottom'),
  );
  const handle = scrollHandle(node);
  top.addEventListener('click', handle.toggle);
  return handle;
}

/** Add `in` to each element as it scrolls into view (CSS does the animation). */
export function revealOnScroll(root: ParentNode, selector = '.reveal'): void {
  const els = Array.from(root.querySelectorAll<HTMLElement>(selector));
  if (typeof IntersectionObserver === 'undefined') {
    els.forEach((e) => e.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    },
    { threshold: 0.15 },
  );
  els.forEach((e) => io.observe(e));
}

/** One slider per registered param. */
export function paramSliders(
  values: GenParams,
  onChange: (key: string) => void,
  opts: { exclude?: string[] } = {},
): HTMLElement {
  const wrap = h('div', { class: 'rows' });
  for (const p of params.all()) {
    if (opts.exclude?.includes(p.key)) continue;
    if (values[p.key] === undefined) values[p.key] = p.default;
    const out = h('output', {}, String(values[p.key]));
    const input = h('input', {
      type: 'range',
      min: p.min,
      max: p.max,
      step: p.step,
      value: values[p.key],
      'data-param': p.key,
    });
    input.addEventListener('input', () => {
      values[p.key] = Number(input.value);
      out.textContent = input.value;
      onChange(p.key);
    });
    wrap.append(h('label', { class: 'row' }, h('span', {}, p.label), input, out));
  }
  return wrap;
}

function checkbox(label: string, checked: boolean, attrs: Attrs, onChange: (on: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', checked, ...attrs });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'check' }, input, label);
}

/** One checkbox per registered render layer. */
export function layerToggles(renderer: Renderer): HTMLElement {
  const wrap = h('div', { class: 'checks' });
  for (const l of layers.all().sort(byOrder)) {
    if (!flagOn(l.flag)) continue;
    wrap.append(
      checkbox(l.label ?? l.name, renderer.isOn(l), { 'data-layer': l.name }, (on) => renderer.toggles.set(l.name, on)),
    );
  }
  return wrap;
}

/** One checkbox per registered generator feature. Writes into `toggles` (missing = on). */
export function featureToggles(toggles: Record<string, boolean>, onChange: () => void): HTMLElement {
  const wrap = h('div', { class: 'checks' });
  for (const f of features.all().sort(byOrder)) {
    wrap.append(
      checkbox(f.label ?? f.name, toggles[f.name] !== false, { 'data-feature': f.name }, (on) => {
        toggles[f.name] = on;
        onChange();
      }),
    );
  }
  return wrap;
}

/** One button per registered element (EMPTY acts as an eraser). */
export function elementPalette(selected: number, onPick: (id: number) => void): HTMLElement {
  const wrap = h('div', { class: 'palette' });
  const buttons: HTMLButtonElement[] = [];
  for (const e of elements.all()) {
    const b = button(e.id === 0 ? 'erase' : e.name, () => {
      for (const o of buttons) o.classList.toggle('on', o === b);
      onPick(e.id);
    }, { 'data-element': e.id });
    b.classList.toggle('on', e.id === selected);
    buttons.push(b);
    wrap.append(b);
  }
  return wrap;
}

/** One button per active, non-debug ability. Returns a function to clear the highlight. */
export function abilityBar(onPick: (id: AbilityId) => void): { node: HTMLElement; clear: () => void } {
  const node = h('div', { class: 'palette' });
  const buttons: HTMLButtonElement[] = [];
  for (const a of activeAbilities(false)) {
    const b = button(`${a.icon ?? ''} ${a.name}`.trim(), () => {
      for (const o of buttons) o.classList.toggle('on', o === b);
      onPick(a.id);
    }, { 'data-ability': a.id });
    buttons.push(b);
    node.append(b);
  }
  return { node, clear: () => buttons.forEach((b) => b.classList.remove('on')) };
}

/** One readout row per registered metric. */
export function metricReadout(): { node: HTMLElement; update: (r: ScanResult) => void } {
  const node = h('dl', { class: 'readout' });
  const cells = new Map<string, HTMLElement>();
  for (const m of metrics.all()) {
    const dd = h('dd', { 'data-metric': m.name }, '-');
    cells.set(m.name, dd);
    node.append(h('dt', {}, m.label ?? m.name), dd);
  }
  const peaks = h('dd', {}, '-');
  node.append(h('dt', {}, 'Peaks'), peaks);
  return {
    node,
    update: (r) => {
      for (const [name, dd] of cells) dd.textContent = String(r.counts[name] ?? '-');
      peaks.textContent = r.peaks.map((p) => `${p.h}`).join(' · ') || 'none';
    },
  };
}

/** Collapsible list of every registry and its entries. */
export function registryInspector(): HTMLElement {
  const wrap = h('div', { class: 'registries' });
  for (const r of ALL_REGISTRIES) {
    const items = r.all().map((item) => h('li', {}, r.labelOf(item)));
    wrap.append(
      h('details', { 'data-registry': r.kind }, h('summary', {}, `${r.kind} (${r.size})`), h('ul', {}, ...items)),
    );
  }
  return wrap;
}

/**
 * Drive a Clock from requestAnimationFrame and draw each frame (frame gets the frame time in ms).
 * If `shouldAdvance` returns false the sim does not advance that frame (hit-stop). Returns a stop function.
 */
/**
 * Canvas pixels per cell for a page showing a `cellsWide` grid across the window: enough for the
 * screen's real pixels (window width x devicePixelRatio), at most `max` (the art's own k). Every
 * per-pixel cost goes with its square, so pixels the screen cannot show are not drawn. `?k=N` in
 * the URL overrides it (e.g. ?k=4 for full resolution).
 */
export function displayScale(cellsWide: number, max: number): number {
  if (typeof location === 'undefined' || typeof innerWidth === 'undefined') return max; // no window (tests)
  const forced = Number(new URLSearchParams(location.search).get('k'));
  if (forced >= 1) return Math.min(max, Math.round(forced));
  const need = (innerWidth * (globalThis.devicePixelRatio || 1)) / cellsWide;
  return Math.max(1, Math.min(max, Math.ceil(need - 0.15)));
}

export function startLoop(clock: Clock, frame: (dtMs: number) => void, shouldAdvance?: () => boolean): () => void {
  let last = -1;
  let id = 0;
  let stopped = false;
  // a slow frame must not be followed by a burst of catch-up ticks (that makes the next frame slow
  // too, and the page spirals): past 4 ticks per frame the sim runs slower instead
  clock.maxTicksPerAdvance = Math.min(clock.maxTicksPerAdvance, 4);
  const loop = (t: number) => {
    if (stopped) return;
    const dt = last < 0 ? 0 : Math.min(t - last, 250);
    if (!perfEnabled) {
      if (shouldAdvance?.() !== false) clock.advance(dt);
      last = t;
      frame(dt);
    } else {
      perf.frameStart(last < 0 ? 0 : t - last);
      const s = performance.now();
      const n = shouldAdvance?.() !== false ? clock.advance(dt) : 0;
      const m = performance.now();
      perf.sim(m - s, n);
      last = t;
      frame(dt);
      perf.frameEnd(performance.now() - m);
    }
    id = requestAnimationFrame(loop);
  };
  id = requestAnimationFrame(loop);
  return () => {
    stopped = true;
    cancelAnimationFrame(id);
  };
}

const brushKeys = new WeakMap<HTMLElement, string>();

/**
 * Show the brush ring as the SYSTEM cursor (an SVG circle `radius` cells across at the canvas's
 * current on-screen size): the OS draws it at the mouse's own rate, so it never trails the pointer
 * however long a frame takes (a ring painted in the canvas is always a frame or more behind).
 * Cheap to call on every pointer move: it only rebuilds the cursor when its size changes.
 */
export function brushCursor(canvas: HTMLCanvasElement, cellsWide: number, radius: number): void {
  const perCell = canvas.clientWidth / Math.max(1, cellsWide);
  const r = Math.max(2, Math.min(60, radius * perCell));
  const size = Math.ceil(r * 2 + 4);
  const key = `${size}`;
  if (brushKeys.get(canvas) === key) return;
  brushKeys.set(canvas, key);
  const c = size / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<circle cx="${c}" cy="${c}" r="${r.toFixed(2)}" fill="none" stroke="rgba(178,34,34,0.9)" stroke-width="1.2"/>` +
    `<circle cx="${c}" cy="${c}" r="0.9" fill="rgba(178,34,34,0.9)"/></svg>`;
  canvas.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${Math.round(c)} ${Math.round(c)}, crosshair`;
}

/** Pointer position in cell coordinates (`scale` = canvas pixels per cell, the renderer's scale). */
export function toCell(canvas: HTMLCanvasElement, e: PointerEvent, scale = 1): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / Math.max(1, r.width)) * (canvas.width / scale);
  const y = ((e.clientY - r.top) / Math.max(1, r.height)) * (canvas.height / scale);
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}
