/**
 * Shared DOM helpers for the test pages. Every list here is built from a registry, so a newly
 * dropped-in element/ability/param/layer/metric shows up without touching page code.
 */
import { activeAbilities, type AbilityId } from '../core/abilities';
import type { Clock } from '../core/clock';
import { flagOn } from '../core/config';
import { elements } from '../core/elements';
import { features } from '../core/features';
import { params, type GenParams } from '../core/params';
import { ALL_REGISTRIES, byOrder } from '../core/registry';
import { layers, type Renderer } from '../core/render';
import { metrics, type ScanResult } from '../core/scan';

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

export function panel(title: string, ...children: (Node | string)[]): HTMLElement {
  return h('section', { class: 'panel' }, h('h3', {}, title), ...children);
}

export function button(label: string, onClick: () => void, attrs: Attrs = {}): HTMLButtonElement {
  const b = h('button', { type: 'button', ...attrs }, label);
  b.addEventListener('click', onClick);
  return b;
}

export function pageHeader(title: string): HTMLElement {
  return h(
    'header',
    { class: 'top' },
    h('h1', {}, '斬山水 ', h('span', {}, title)),
    h(
      'nav',
      {},
      h('a', { href: './index.html' }, 'Game'),
      h('a', { href: './generator.html' }, 'Generator'),
      h('a', { href: './sandbox.html' }, 'Sandbox'),
    ),
  );
}

/** Site navbar for the player-facing pages (Home, Gallery). */
export function siteNav(active: 'Home' | 'Generator' | 'Sandbox' | 'Gallery'): HTMLElement {
  const links = [
    ['Home', './index.html'],
    ['Generator', './generator.html'],
    ['Sandbox', './sandbox.html'],
    ['Gallery', './gallery.html'],
  ] as const;
  const nav = h('nav', {});
  for (const [label, href] of links) {
    const a = h('a', { href }, label);
    if (label === active) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }
  return h('header', { class: 'top home-nav' }, h('h1', {}, 'Blade & Brush'), nav);
}

/** One slider per registered param. */
export function paramSliders(values: GenParams, onChange: (key: string) => void): HTMLElement {
  const wrap = h('div', { class: 'rows' });
  for (const p of params.all()) {
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

/** Drive a Clock from requestAnimationFrame and draw each frame. Returns a stop function. */
export function startLoop(clock: Clock, frame: () => void): () => void {
  let last = -1;
  let id = 0;
  let stopped = false;
  const loop = (t: number) => {
    if (stopped) return;
    clock.advance(last < 0 ? 0 : Math.min(t - last, 250));
    last = t;
    frame();
    id = requestAnimationFrame(loop);
  };
  id = requestAnimationFrame(loop);
  return () => {
    stopped = true;
    cancelAnimationFrame(id);
  };
}

/** Pointer position in cell coordinates. */
export function toCell(canvas: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / Math.max(1, r.width)) * canvas.width;
  const y = ((e.clientY - r.top) / Math.max(1, r.height)) * canvas.height;
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}
