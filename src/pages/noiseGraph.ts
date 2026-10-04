import { DEFAULT_DIMS } from '../core/constants';
import type { GenParams } from '../core/params';
import { DEFAULT_ART_K } from '../gen/artState';
import { pickPeaks, scoreCurve, type ScoreCurve } from '../gen/plan';
import { units } from '../gen/units';
import { h } from './ui';

/**
 * Interactive soundwave for the mountain picker (replaces the mountain-height
 * and spacing sliders on the generator page). Shows the real score curve for
 * the current seed, a draggable gate line (height + count, coupled like an
 * audio gate), and draggable peak picks (spacing). Double-click pins a peak
 * so regenerate() must keep it; right-click (or double-click) a pin to drop
 * it. Session-only: reload resets to seed + params.
 */
export interface NoiseGraph {
  node: HTMLElement;
  /** Refresh after seed/params/level change. */
  sync: () => void;
  /** Current editorial state for generate(). */
  edits: () => { gate: number | undefined; pins: number[]; mountainHeight: number; spacing: number };
  /** Reset pins and gate. */
  reset: () => void;
}

export function noiseGraph(opts: {
  seed: () => number;
  params: GenParams;
  /** Forced peak xs (painting units) from the level's setpieces, if any. */
  levelForced: () => number[];
  onChange: () => void;
}): NoiseGraph {
  const W = units(DEFAULT_DIMS, DEFAULT_ART_K).widthUnits;
  const canvas = h('canvas', { class: 'noise-canvas' });
  const readout = h('p', { class: 'home-note noise-readout' });
  const hint = h(
    'p',
    { class: 'home-note' },
    'Drag the line for height · drag peaks for spacing · double-click to pin a peak · right-click a pin to drop it.',
  );
  const node = h('div', { class: 'noise-wrap' }, canvas, readout, hint);

  let gate: number | undefined;
  let pins: number[] = [];
  let curve: ScoreCurve = scoreCurve(0, 0.5, W);
  let picks: number[] = [];

  function recompute(): void {
    curve = scoreCurve(opts.seed(), opts.params.spacing, W, gate);
    picks = pickPeaks(curve, [...opts.levelForced(), ...pins]);
    draw();
    const g = gate ?? curve.bar;
    readout.textContent =
      `Height ${opts.params.mountainHeight.toFixed(2)} · gate ${g.toFixed(2)} · ` +
      `spacing ${opts.params.spacing.toFixed(2)} · ${picks.length} peaks${pins.length ? ` (${pins.length} pinned)` : ''}`;
  }

  function draw(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(50, canvas.clientWidth);
    const ht = 170;
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(ht * dpr)) canvas.height = Math.round(ht * dpr);
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, ht);
    const X = (u: number) => (u / W) * w;
    const Y = (s: number) => ht - 8 - s * (ht - 24);
    // Filled wave.
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
    g.lineWidth = 1.5;
    g.stroke();
    // Accepted region tint.
    const gv = gate ?? curve.bar;
    g.fillStyle = 'rgba(178, 34, 34, 0.07)';
    g.fillRect(0, 0, w, Y(gv));
    // Gate line.
    g.beginPath();
    g.moveTo(0, Y(gv));
    g.lineTo(w, Y(gv));
    g.strokeStyle = '#b22222';
    g.lineWidth = 2;
    g.stroke();
    // Picks: pinned red squares, free dark dots, below-gate hollow.
    for (const px of picks) {
      const s = curve.score[curve.xs.reduce((best, _, i) => (Math.abs(curve.xs[i] - px) < Math.abs(curve.xs[best] - px) ? i : best), 0)];
      const pinned = pins.some((q) => Math.abs(q - px) < 6);
      g.beginPath();
      if (pinned) {
        g.fillStyle = '#b22222';
        g.fillRect(X(px) - 4, Y(s) - 4, 8, 8);
      } else {
        g.fillStyle = s >= gv ? '#2e2b28' : 'transparent';
        g.strokeStyle = '#6b645c';
        g.arc(X(px), Y(s), 4, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }
  }

  const toUnits = (e: { clientX: number }): number => {
    const r = canvas.getBoundingClientRect();
    return Math.min(W, Math.max(0, ((e.clientX - r.left) / Math.max(1, r.width)) * W));
  };
  const toScore = (e: { clientX: number; clientY: number }): number => {
    const r = canvas.getBoundingClientRect();
    const ht = 170;
    return Math.min(1, Math.max(0, (ht - 8 - (e.clientY - r.top)) / (ht - 24)));
  };

  const peakAt = (u: number): number => {
    const r = canvas.getBoundingClientRect();
    const tol = (12 / Math.max(1, r.width)) * W;
    let best = -1;
    let bd = Infinity;
    picks.forEach((px, i) => {
      const d = Math.abs(px - u);
      if (d < tol && d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };

  type Drag = { kind: 'gate' } | { kind: 'pin'; index: number } | null;
  let drag: Drag = null;
  let moved = false;

  const commit = () => {
    recompute();
    opts.onChange();
  };

  /** Retune spacing from the closest pair of displayed picks, then resample. */
  const retuneSpacing = () => {
    const all = [...picks].sort((a, b) => a - b);
    let min = Infinity;
    for (let i = 1; i < all.length; i++) min = Math.min(min, all[i] - all[i - 1]);
    if (Number.isFinite(min)) opts.params.spacing = Math.min(1, Math.max(0, (min - 260) / (700 - 260)));
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    moved = false;
    const gv = gate ?? curve.bar;
    const r = canvas.getBoundingClientRect();
    const gateY = r.top + (170 - 8 - gv * (170 - 24));
    if (Math.abs(e.clientY - gateY) < 8) {
      drag = { kind: 'gate' };
      return;
    }
    const u = Math.round(toUnits(e));
    const i = peakAt(u);
    if (i >= 0) {
      // Pin it (or grab the pin already there) and drag the pin itself,
      // so identity stays stable while the greedy order reshuffles.
      const tol = (12 / Math.max(1, r.width)) * W;
      let pi = pins.findIndex((q) => Math.abs(q - picks[i]) < tol);
      if (pi < 0) {
        pins.push(Math.round(picks[i]));
        pi = pins.length - 1;
      }
      drag = { kind: 'pin', index: pi };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    moved = true;
    if (drag.kind === 'gate') {
      const g = Math.round(toScore(e) * 100) / 100;
      gate = g;
      opts.params.mountainHeight = g;
      recompute();
    } else {
      pins[drag.index] = Math.round(toUnits(e));
      recompute();
      retuneSpacing();
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
    const pi = pins.findIndex((q) => Math.abs(q - u) < (12 / Math.max(1, canvas.getBoundingClientRect().width)) * W);
    if (pi >= 0) pins.splice(pi, 1);
    else pins.push(u);
    recompute();
    opts.onChange();
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const u = Math.round(toUnits(e));
    const pi = pins.findIndex((q) => Math.abs(q - u) < (12 / Math.max(1, canvas.getBoundingClientRect().width)) * W);
    if (pi >= 0) {
      pins.splice(pi, 1);
      recompute();
      opts.onChange();
    }
  });

  return {
    node,
    sync: recompute,
    edits: () => ({ gate, pins: [...pins], mountainHeight: opts.params.mountainHeight, spacing: opts.params.spacing }),
    reset: () => {
      gate = undefined;
      pins = [];
      recompute();
    },
  };
}
