import { DEFAULT_DIMS, type LevelDims } from '../core/constants';
import type { GenParams } from '../core/params';
import type { SetpieceSpec } from '../core/setpieces';
import { DEFAULT_ART_K } from '../gen/artState';
import { hintsFor, makePlan, scoreCurve, type ScoreCurve } from '../gen/plan';
import { units } from '../gen/units';
import { button, h } from './ui';

/**
 * Interactive skyline for the mountain picker (replaces the mountain-height
 * and spacing sliders). The mountains drawn are the real plan for the current
 * seed: grab one and move it anywhere (position and height become a pinned
 * setpiece override), and the wave below shows the noise curve plus the gate
 * line (drag for height, paint to reshape, Alt relaxes). Double-click pins /
 * unpins, right-click drops a pin. Session-only.
 */
export interface NoiseGraph {
  node: HTMLElement;
  /** Refresh after seed/params/level change. */
  sync: () => void;
  /** Current editorial state for generate(). */
  edits: () => {
    gate: number | undefined;
    pins: { x: number; h?: number }[];
    offsets: Record<number, number>;
    mountainHeight: number;
    spacing: number;
  };
  /** Drop pins, gate and painted offsets. */
  reset: () => void;
}

/** Paint-brush radius on the wave, painting units. */
const BRUSH = 120;
/** Skyline zone height, px; the wave lives below it. */
const SKY = 140;
const HT = 250;

export function noiseGraph(opts: {
  seed: () => number;
  params: GenParams;
  dims?: LevelDims;
  /** Level setpieces (forced mountains steer the plan around them). */
  setpieces: () => SetpieceSpec[];
  /** Lock the gate (mountain height) and peak-spacing gestures. */
  locks?: { height?: boolean; spacing?: boolean };
  onChange: () => void;
}): NoiseGraph {
  const dims = opts.dims ?? DEFAULT_DIMS;
  const W = units(dims, DEFAULT_ART_K).widthUnits;
  const canvas = h('canvas', { class: 'noise-canvas' });
  const readout = h('p', { class: 'home-note noise-readout' });
  const hint = h(
    'p',
    { class: 'home-note' },
    'Drag a mountain to move it · drag it taller/shorter to resize · drag the line for height' +
      ' · paint the wave to reshape it (Alt relaxes) · double-click to pin · right-click a pin to drop it.',
  );
  const resetBtn = button('Reset shaping', () => {
    reset();
    opts.onChange();
  });
  const node = h('div', { class: 'noise-wrap' }, canvas, readout, h('div', { class: 'row' }, resetBtn), hint);

  interface Pin {
    x: number;
    /** Height override, 0..2.5 like a mountain setpiece; undefined follows the plan. */
    h?: number;
  }

  let gate: number | undefined;
  let pins: Pin[] = [];
  let offsets: Record<number, number> = {};
  let curve: ScoreCurve = scoreCurve(0, 0.5, W);
  /** Planned peaks (near + mid) for the current edits: what regenerate() will build. */
  let glyphs: { x: number; h: number; hw: number; pinned: boolean }[] = [];

  const mh = () => Math.max(0, opts.params.mountainHeight) * 2;
  const maxH = () => Math.max(1, mh()) * 500;

  function pinSpecs(): SetpieceSpec[] {
    return pins.map((p) => ({ type: 'mountain', x: p.x / W, ...(p.h === undefined ? {} : { height: p.h }) }));
  }

  function recompute(): void {
    curve = scoreCurve(opts.seed(), opts.params.spacing, W, gate, offsets);
    glyphs = [];
    if (mh() > 0) {
      const plan = makePlan(opts.seed(), opts.params, units(dims, DEFAULT_ART_K), hintsFor([...opts.setpieces(), ...pinSpecs()]), gate, offsets);
      for (const q of plan) {
        if (q.kind !== 'peak' || q.depth === 'far') continue;
        const pin = pins.find((p) => Math.abs(p.x - q.x) < 1);
        glyphs.push({ x: q.x, h: q.height, hw: q.halfWidth, pinned: pin !== undefined });
      }
    }
    draw();
    const g = gate ?? curve.bar;
    readout.textContent =
      `Height ${opts.params.mountainHeight.toFixed(2)} · gate ${g.toFixed(2)} · ` +
      `spacing ${opts.params.spacing.toFixed(2)} · ${glyphs.length} mountains` +
      `${pins.length ? ` (${pins.length} pinned)` : ''}${Object.keys(offsets).length ? ' · wave painted' : ''}`;
  }

  function draw(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(50, canvas.clientWidth);
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(HT * dpr)) canvas.height = Math.round(HT * dpr);
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, HT);
    const X = (u: number) => (u / W) * w;
    // Skyline: planned mountains as filled silhouettes on a ground line.
    const GY = (hu: number) => SKY - 6 - (hu / maxH()) * (SKY - 18);
    g.beginPath();
    g.moveTo(0, SKY);
    g.lineTo(w, SKY);
    g.strokeStyle = '#6b645c';
    g.lineWidth = 1;
    g.stroke();
    for (const m of glyphs) {
      const hwpx = Math.max(8, (m.hw / W) * w * 0.8);
      const apex = GY(m.h);
      g.beginPath();
      g.moveTo(X(m.x) - hwpx, SKY);
      g.quadraticCurveTo(X(m.x) - hwpx * 0.3, apex + (SKY - apex) * 0.35, X(m.x), apex);
      g.quadraticCurveTo(X(m.x) + hwpx * 0.3, apex + (SKY - apex) * 0.35, X(m.x) + hwpx, SKY);
      g.closePath();
      if (m.pinned) {
        g.fillStyle = 'rgba(178, 34, 34, 0.28)';
        g.fill();
        g.strokeStyle = '#b22222';
      } else {
        g.fillStyle = 'rgba(46, 43, 40, 0.14)';
        g.fill();
        g.strokeStyle = '#2e2b28';
      }
      g.lineWidth = 1.5;
      g.stroke();
    }
    // Wave below.
    const top = SKY + 10;
    const Y = (s: number) => HT - 8 - s * (HT - 8 - top);
    g.beginPath();
    g.moveTo(0, Y(0));
    for (let i = 0; i < curve.xs.length; i++) g.lineTo(X(curve.xs[i]), Y(curve.score[i]));
    g.lineTo(w, Y(0));
    g.closePath();
    g.fillStyle = 'rgba(46, 43, 40, 0.12)';
    g.fill();
    g.beginPath();
    for (let i = 0; i < curve.xs.length; i++) (i === 0 ? g.moveTo : g.lineTo).call(g, X(curve.xs[i]), Y(curve.score[i]));
    g.strokeStyle = '#2e2b28';
    g.lineWidth = 1;
    g.stroke();
    const gv = gate ?? curve.bar;
    g.beginPath();
    g.moveTo(0, Y(gv));
    g.lineTo(w, Y(gv));
    g.strokeStyle = '#b22222';
    g.lineWidth = 2;
    if (opts.locks?.height) g.setLineDash([5, 4]);
    g.stroke();
    g.setLineDash([]);
  }

  const toUnits = (e: { clientX: number }): number => {
    const r = canvas.getBoundingClientRect();
    return Math.min(W, Math.max(0, ((e.clientX - r.left) / Math.max(1, r.width)) * W));
  };
  const toScore = (e: { clientX: number; clientY: number }): number => {
    const r = canvas.getBoundingClientRect();
    const top = SKY + 10;
    return Math.min(1, Math.max(0, (HT - 8 - (e.clientY - r.top)) / (HT - 8 - top)));
  };
  const inSky = (e: { clientY: number }): boolean => {
    const r = canvas.getBoundingClientRect();
    return e.clientY - r.top < SKY + 4;
  };

  const glyphAt = (u: number): number => {
    const r = canvas.getBoundingClientRect();
    const tol = (14 / Math.max(1, r.width)) * W;
    let best = -1;
    let bd = Infinity;
    glyphs.forEach((m, i) => {
      const d = Math.abs(m.x - u);
      if (d < tol && d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };

  /** Paint offsets toward the pointer score with a soft brush; Alt relaxes. */
  const paint = (u: number, s: number, relax: boolean) => {
    const R = BRUSH / 2.5;
    for (let i = 0; i < curve.xs.length; i++) {
      const d = Math.abs(curve.xs[i] - u);
      if (d > BRUSH) continue;
      const fall = Math.exp((-d * d) / (2 * R * R)) * 0.4;
      const prev = offsets[i] ?? 0;
      const target = relax ? prev * (1 - fall) : prev + (Math.min(1, Math.max(0, s)) - curve.score[i]) * fall;
      const clamped = Math.min(1, Math.max(-1, target));
      if (Math.abs(clamped) < 0.004) delete offsets[i];
      else offsets[i] = Math.round(clamped * 1000) / 1000;
    }
  };

  /** Height-scale (0..2.5) for a glyph apex at pointer height. */
  const heightAt = (clientY: number): number | undefined => {
    if (mh() <= 0) return undefined;
    const r = canvas.getBoundingClientRect();
    const hu = ((SKY - 6 - (clientY - r.top)) / (SKY - 18)) * maxH();
    return Math.min(2.5, Math.max(0.05, Math.round((((hu / mh()) - 100) / 400) * 100) / 100));
  };

  type Drag = { kind: 'gate' } | { kind: 'peak'; index: number } | { kind: 'paint'; erase: boolean } | null;
  let drag: Drag = null;
  let moved = false;

  const commit = () => {
    recompute();
    opts.onChange();
  };

  /** Retune spacing from the closest pair of planned mountains, then resample. */
  const retuneSpacing = () => {
    if (opts.locks?.spacing) return;
    const all = glyphs.map((m) => m.x).sort((a, b) => a - b);
    let min = Infinity;
    for (let i = 1; i < all.length; i++) min = Math.min(min, all[i] - all[i - 1]);
    if (Number.isFinite(min)) opts.params.spacing = Math.min(1, Math.max(0, (min - 260) / (700 - 260)));
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    moved = false;
    if (!inSky(e)) {
      const gv = gate ?? curve.bar;
      const r = canvas.getBoundingClientRect();
      const top = SKY + 10;
      const gateY = r.top + (HT - 8 - gv * (HT - 8 - top));
      if (Math.abs(e.clientY - gateY) < 8 && !opts.locks?.height) {
        drag = { kind: 'gate' };
        return;
      }
      drag = { kind: 'paint', erase: e.altKey };
      return;
    }
    const u = Math.round(toUnits(e));
    const i = glyphAt(u);
    if (i < 0) return;
    // Pin the mountain (or grab its pin) and drag it directly: position and
    // height become an override that regenerate() must honor.
    let pi = pins.findIndex((q) => Math.abs(q.x - glyphs[i].x) < 6);
    if (pi < 0) {
      pins.push({ x: Math.round(glyphs[i].x) });
      pi = pins.length - 1;
    }
    drag = { kind: 'peak', index: pi };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    moved = true;
    if (drag.kind === 'gate') {
      const g = Math.round(toScore(e) * 100) / 100;
      gate = g;
      opts.params.mountainHeight = g;
      recompute();
    } else if (drag.kind === 'peak') {
      const pin = pins[drag.index];
      pin.x = Math.round(toUnits(e));
      const hh = heightAt(e.clientY);
      if (hh !== undefined) pin.h = hh;
      recompute();
      retuneSpacing();
      recompute();
    } else {
      paint(toUnits(e), toScore(e), drag.erase || e.altKey);
      recompute();
    }
  });
  const endDrag = () => {
    if (drag && moved) commit();
    drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => {
    drag = null;
  });
  canvas.addEventListener('dblclick', (e) => {
    e.preventDefault();
    const u = Math.round(toUnits(e));
    const r = canvas.getBoundingClientRect();
    const tol = (12 / Math.max(1, r.width)) * W;
    const pi = pins.findIndex((q) => Math.abs(q.x - u) < tol);
    if (pi >= 0) pins.splice(pi, 1);
    else pins.push({ x: u });
    commit();
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const u = Math.round(toUnits(e));
    const r = canvas.getBoundingClientRect();
    const tol = (12 / Math.max(1, r.width)) * W;
    const pi = pins.findIndex((q) => Math.abs(q.x - u) < tol);
    if (pi >= 0) {
      pins.splice(pi, 1);
      commit();
    }
  });

  function reset(): void {
    gate = undefined;
    pins = [];
    offsets = {};
    recompute();
  }

  return {
    node,
    sync: recompute,
    edits: () => ({
      gate,
      pins: pins.map((p) => ({ ...p })),
      offsets: { ...offsets },
      mountainHeight: opts.params.mountainHeight,
      spacing: opts.params.spacing,
    }),
    reset,
  };
}
