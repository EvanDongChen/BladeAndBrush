import { DEFAULT_DIMS, type LevelDims } from '../core/constants';
import { params as paramDefs, type GenParams } from '../core/params';
import type { SetpieceSpec } from '../core/setpieces';
import { MAX_HEIGHT_SCALE, MIN_HEIGHT_SCALE, spacingForApart } from '../gen/plan';
import { skyline, type SkyMountain, type Skyline } from '../gen/skyline';
import { button, h } from './ui';

/**
 * Mountain graph (replaces the mountain-height and spacing sliders): the planned mountains with the silhouettes
 * the painting will have, all standing on one ground line (nearest in front) because the scanner
 * measures every mountain from its own foot. The red line is the scanner's tall-peak bar. A dot
 * marks every peak the scanner will count: filled red above the bar (a tall peak), a ring below.
 * Mountains that do not count (summit hidden in the painting, or a plateau) merge into one faint
 * shape behind. A legend (top right) names the marks, and the readout under the graph says what
 * the thing under the pointer does, so the panel needs no instructions.
 *
 * - Drag the red line down to grow every mountain under it (mountain height), up to shrink them.
 * - Drag a mountain up or down to change only that one's height; double-click it to undo that.
 * - The ruler in the top-left corner is the least gap between mountain groups (spacing): drag its
 *   right end. Spacing decides which mountains exist, so it drops per-mountain height edits.
 *   Ticks along the bottom mark the group centres.
 *
 * Edits only change the graph. The painting changes when Redraw is pressed.
 */
export interface NoiseGraph {
  node: HTMLElement;
  /** Redraw the graph after a seed/params/level change (keeps pending edits). */
  sync: () => void;
  /** The edits the painting was last drawn with, for generate(). */
  edits: () => { mountainHeight: number; spacing: number; heights: Record<number, number> };
  /** Drop every edit, pending and drawn (e.g. a new seed: the mountains are different ones). */
  reset: () => void;
}

/** Pointer slop around the red line and the ruler's handle, px. */
const LINE_GRAB = 7;
/** The spacing ruler's place in the top-left corner, px. */
const RULER_X = 10;
const RULER_Y = 22;

export function noiseGraph(opts: {
  seed: () => number;
  params: GenParams;
  dims?: LevelDims;
  /** Level setpieces (forced mountains are part of the plan). */
  setpieces: () => SetpieceSpec[];
  /** What the level fixes: heights (line and mountains) and/or spacing (the ruler). */
  locks?: { height?: boolean; spacing?: boolean };
  /** Redraw pressed: params.mountainHeight and params.spacing are already set; regenerate with edits(). */
  onRedraw: () => void;
}): NoiseGraph {
  const dims = opts.dims ?? DEFAULT_DIMS;
  const mhDef = paramDefs.get('mountainHeight');
  const mhMin = mhDef?.min ?? 0;
  const mhMax = mhDef?.max ?? 1;
  const lockH = opts.locks?.height === true;
  const lockS = opts.locks?.spacing === true;

  const canvas = h('canvas', { class: 'noise-canvas' });
  canvas.style.aspectRatio = `${dims.w} / ${dims.h}`;
  const readout = h('p', { class: 'home-note noise-readout' });
  const redrawBtn = button('Redraw', () => redraw());
  const revertBtn = button('Undo changes', () => {
    pending = { ...drawn, heights: { ...drawn.heights } };
    recompute();
  });
  const resetBtn = button('Reset heights', () => {
    pending = { ...pending, heights: {} };
    recompute();
  });
  const node = h(
    'div',
    { class: 'noise-wrap' },
    canvas,
    readout,
    h('div', { class: 'row' }, redrawBtn, revertBtn, ...(lockH ? [] : [resetBtn])),
  );

  interface Edits {
    mh: number;
    sp: number;
    heights: Record<number, number>;
  }
  /** What the painting was drawn with, and what the graph shows. */
  let drawn: Edits = { mh: opts.params.mountainHeight, sp: opts.params.spacing, heights: {} };
  let pending: Edits = { ...drawn, heights: {} };
  let sky: Skyline = { w: dims.w, h: dims.h, floorY: dims.h, mountains: [], tallRise: dims.h, groups: [], minApart: 0, cellsPerUnit: 1 };
  let hover: { kind: 'line' } | { kind: 'gap' } | { kind: 'mountain'; m: SkyMountain } | null = null;
  /** Height edits set aside by a spacing drag, restored if the drag ends where it began. */
  let shelved: Record<number, number> | null = null;

  type Drag =
    | { kind: 'line'; y0: number; mh0: number }
    | { kind: 'gap'; anchor: number }
    | { kind: 'mountain'; index: number; y0: number; scale0: number; rise0: number }
    | null;
  let drag: Drag = null;
  /** Pointer y during a line drag, graph px (the guide line). */
  let guideY = 0;

  // Graph space is "rise": cells above a mountain's own foot, drawn up from the bottom edge.
  /** Graph y (cells, 0 at the top) of a silhouette top on mountain m. */
  const gy = (m: SkyMountain, top: number) => sky.h - Math.max(0, m.foot - top);
  /** Graph y of the tall-peak bar. */
  const tallY = () => sky.h - sky.tallRise;

  /** The ruler, in cells: fixed at the top-left corner, minApart long. */
  const ruler = () => {
    const a = (RULER_X / Math.max(1, canvas.clientWidth)) * sky.w;
    return { a, b: a + sky.minApart };
  };

  const same = (a: Edits, b: Edits) =>
    a.mh === b.mh &&
    a.sp === b.sp &&
    Object.keys(a.heights).length === Object.keys(b.heights).length &&
    Object.entries(a.heights).every(([k, v]) => b.heights[Number(k)] === v);

  function recompute(): void {
    sky = skyline(opts.seed(), { ...opts.params, mountainHeight: pending.mh, spacing: pending.sp }, dims, opts.setpieces(), pending.heights);
    if (hover?.kind === 'mountain') {
      const idx = hover.m.index;
      const m = sky.mountains.find((q) => q.index === idx);
      hover = m ? { kind: 'mountain', m } : null;
    }
    draw();
    const peaks = sky.mountains.filter((m) => m.peak);
    const tall = peaks.filter((m) => m.peak?.tall).length;
    const edited = Object.keys(pending.heights).length;
    const dirty = !same(pending, drawn);
    let text = `Height ${pending.mh.toFixed(2)} · spacing ${pending.sp.toFixed(2)} · ${sky.groups.length} group${sky.groups.length === 1 ? '' : 's'} · ${tall} tall peak${tall === 1 ? '' : 's'}, ${peaks.length - tall} lesser`;
    if (edited) text += ` · ${edited} mountain${edited === 1 ? '' : 's'} resized`;
    if (hover?.kind === 'line') text = 'Red line: peaks above it are tall. Drag down to raise every mountain, up to lower them';
    else if (hover?.kind === 'gap') text = `Min gap between mountain groups (spacing ${pending.sp.toFixed(2)}): drag to spread them out or bring them closer`;
    else if (hover?.kind === 'mountain') {
      const s = pending.heights[hover.m.index] ?? 1;
      const kind = hover.m.peak ? (hover.m.peak.tall ? 'tall peak' : 'lesser peak') : hover.m.kind === 'flat' ? 'plateau, not a peak' : 'summit hidden behind a taller mountain, not counted';
      text = `This mountain: ${kind}${s === 1 ? '' : `, ×${s.toFixed(2)}`} · drag up or down to resize it${s === 1 ? '' : ', double-click to put it back'}`;
    }
    if (dirty) text += ' · not painted yet';
    readout.textContent = text;
    redrawBtn.classList.toggle('on', dirty);
    redrawBtn.textContent = dirty ? 'Redraw ●' : 'Redraw';
    revertBtn.disabled = !dirty;
    resetBtn.disabled = edited === 0;
  }

  function draw(): void {
    const dpr = Math.min(2, (typeof window === 'undefined' ? 1 : window.devicePixelRatio) || 1);
    const w = Math.max(50, canvas.clientWidth);
    const ht = Math.max(30, canvas.clientHeight);
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(ht * dpr)) canvas.height = Math.round(ht * dpr);
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, ht);
    const sx = w / sky.w;
    const sy = ht / sky.h;

    const outline = (m: SkyMountain) => {
      g.beginPath();
      g.moveTo(m.x0 * sx, ht);
      for (let j = 0; j < m.tops.length; j++) g.lineTo((m.x0 + j) * sx, gy(m, m.tops[j]) * sy);
      g.lineTo((m.x0 + m.tops.length - 1) * sx, ht);
    };
    // Mountains that do not count (summit hidden in the painting, or a plateau): one faint merged
    // shape behind, no outlines, so they never read as peaks. Far ridges (never scanned) are left out.
    const rest = new Float32Array(Math.ceil(sky.w)).fill(sky.h);
    for (const m of sky.mountains) {
      if (m.depth === 'far' || m.peak) continue;
      for (let j = 0; j < m.tops.length; j++) {
        const x = m.x0 + j;
        if (x >= 0 && x < rest.length) rest[x] = Math.min(rest[x], gy(m, m.tops[j]));
      }
    }
    g.beginPath();
    g.moveTo(0, ht);
    for (let x = 0; x < rest.length; x++) g.lineTo(x * sx, rest[x] * sy);
    g.lineTo(w, ht);
    g.closePath();
    g.fillStyle = 'rgba(120, 112, 100, 0.16)';
    g.fill();
    // The mountains that count, back to front, each with its dot.
    for (const m of sky.mountains) {
      if (m.depth === 'far' || !m.peak) continue;
      const hot = hover?.kind === 'mountain' && hover.m.index === m.index;
      const edited = pending.heights[m.index] !== undefined;
      outline(m);
      g.fillStyle = hot ? '#efe5cf' : '#f6f0e2';
      g.fill();
      g.strokeStyle = hot || edited ? '#8a2a1e' : '#2e2b28';
      g.lineWidth = hot ? 2 : 1;
      g.stroke();
    }

    // The tall-peak bar.
    const lineHot = !lockH && (hover?.kind === 'line' || drag?.kind === 'line');
    g.beginPath();
    g.moveTo(0, tallY() * sy);
    g.lineTo(w, tallY() * sy);
    g.strokeStyle = '#b22222';
    g.lineWidth = lineHot ? 3 : 2;
    if (lockH) g.setLineDash([5, 4]);
    g.stroke();
    g.setLineDash([]);
    if (drag?.kind === 'line') {
      g.beginPath();
      g.moveTo(0, guideY);
      g.lineTo(w, guideY);
      g.strokeStyle = 'rgba(178, 34, 34, 0.45)';
      g.lineWidth = 1;
      g.setLineDash([3, 3]);
      g.stroke();
      g.setLineDash([]);
    }

    // Spacing: a tick under every group centre, and the ruler (least gap between groups).
    g.strokeStyle = '#6b645c';
    g.lineWidth = 1;
    for (const x of sky.groups) {
      g.beginPath();
      g.moveTo(x * sx, ht);
      g.lineTo(x * sx, ht - 7);
      g.stroke();
    }
    const ry = RULER_Y;
    const { a, b } = ruler();
    const gapHot = !lockS && (hover?.kind === 'gap' || drag?.kind === 'gap');
    g.beginPath();
    g.moveTo(a * sx, ry);
    g.lineTo(b * sx, ry);
    g.moveTo(a * sx, ry - 5);
    g.lineTo(a * sx, ry + 5);
    g.strokeStyle = gapHot ? '#8a2a1e' : '#2e2b28';
    g.lineWidth = gapHot ? 2 : 1.25;
    if (lockS) g.setLineDash([4, 3]);
    g.stroke();
    g.setLineDash([]);
    if (!lockS) {
      g.beginPath();
      g.arc(b * sx, ry, gapHot ? 5 : 4, 0, Math.PI * 2);
      g.fillStyle = gapHot ? '#8a2a1e' : '#2e2b28';
      g.fill();
    }
    g.font = '11px ui-monospace, Consolas, monospace';
    g.fillStyle = '#2e2b28';
    g.textBaseline = 'bottom';
    g.fillText('min gap', a * sx + 4, ry - 3);

    // Peaks the scanner will count: red dot = tall, ring = lesser.
    for (const m of sky.mountains) {
      if (!m.peak) continue;
      g.beginPath();
      g.arc(m.peak.x * sx, (sky.h - m.peak.rise) * sy, 3.5, 0, Math.PI * 2);
      if (m.peak.tall) {
        g.fillStyle = '#b22222';
        g.fill();
      } else {
        g.fillStyle = '#f6f0e2';
        g.fill();
        g.strokeStyle = '#2e2b28';
        g.lineWidth = 1.25;
        g.stroke();
      }
    }
    legend(g, w);
  }

  /** Top-right key: what the marks mean. */
  function legend(g: CanvasRenderingContext2D, w: number): void {
    const rows: [string, (x: number, y: number) => void][] = [
      ['tall peak', (x, y) => {
        g.beginPath();
        g.arc(x, y, 3.5, 0, Math.PI * 2);
        g.fillStyle = '#b22222';
        g.fill();
      }],
      ['lesser peak', (x, y) => {
        g.beginPath();
        g.arc(x, y, 3.5, 0, Math.PI * 2);
        g.fillStyle = '#f6f0e2';
        g.fill();
        g.strokeStyle = '#2e2b28';
        g.lineWidth = 1.25;
        g.stroke();
      }],
      ['tall line', (x, y) => {
        g.beginPath();
        g.moveTo(x - 6, y);
        g.lineTo(x + 6, y);
        g.strokeStyle = '#b22222';
        g.lineWidth = 2;
        g.stroke();
      }],
      ['not a peak', (x, y) => {
        g.fillStyle = 'rgba(120, 112, 100, 0.3)';
        g.fillRect(x - 6, y - 4, 12, 8);
      }],
    ];
    g.font = '11px ui-monospace, Consolas, monospace';
    const bw = 18 + Math.max(...rows.map(([t]) => g.measureText(t)?.width ?? t.length * 7)) + 8;
    const bh = rows.length * 15 + 6;
    const x0 = w - bw - 6;
    const y0 = 6;
    g.fillStyle = 'rgba(250, 246, 236, 0.9)';
    g.fillRect(x0, y0, bw, bh);
    g.strokeStyle = 'rgba(46, 43, 40, 0.25)';
    g.lineWidth = 1;
    g.strokeRect(x0 + 0.5, y0 + 0.5, bw - 1, bh - 1);
    g.textBaseline = 'middle';
    rows.forEach(([text, mark], i) => {
      const y = y0 + 10 + i * 15;
      mark(x0 + 11, y);
      g.fillStyle = '#2e2b28';
      g.fillText(text, x0 + 21, y);
    });
  }

  /** Pointer in grid cells, plus graph px y and px per cell. */
  const at = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    const py = e.clientY - r.top;
    return {
      x: ((e.clientX - r.left) / Math.max(1, r.width)) * sky.w,
      y: (py / Math.max(1, r.height)) * sky.h,
      py,
      perCell: r.height / sky.h,
    };
  };

  /** What the pointer is over: the ruler's handle, the red line, then the front-most mountain under it. */
  const pick = (e: MouseEvent): typeof hover => {
    const p = at(e);
    const r = canvas.getBoundingClientRect();
    const pxPerCellX = r.width / sky.w;
    if (!lockS && Math.abs(p.x - ruler().b) * pxPerCellX <= LINE_GRAB + 2 && Math.abs(RULER_Y - p.py) <= LINE_GRAB + 2)
      return { kind: 'gap' };
    if (lockH) return null;
    if (Math.abs(p.y - tallY()) * p.perCell <= LINE_GRAB) return { kind: 'line' };
    for (let i = sky.mountains.length - 1; i >= 0; i--) {
      const m = sky.mountains[i];
      if (m.depth === 'far' || !m.peak) continue; // only the mountains that count can be grabbed
      const t = m.tops[Math.round(p.x) - m.x0];
      // Inside the silhouette, or a few px above its top so short ones are easy to grab.
      if (t !== undefined && t < m.base && p.y >= gy(m, t) - 6 / p.perCell) return { kind: 'mountain', m };
    }
    return null;
  };

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) {
      const next = pick(e);
      const changed =
        next?.kind !== hover?.kind || (next?.kind === 'mountain' && hover?.kind === 'mountain' && next.m.index !== hover.m.index);
      hover = next;
      canvas.style.cursor = !hover ? 'default' : hover.kind === 'gap' ? 'ew-resize' : 'ns-resize';
      if (changed) recompute();
      return;
    }
    const p = at(e);
    if (drag.kind === 'line') {
      // Mountains as tall as the pointer end up at the bar: every height scales by
      // (rise at the start) / (rise at the pointer).
      guideY = p.py;
      const mh = (drag.mh0 * Math.max(1, sky.h - drag.y0)) / Math.max(1, sky.h - p.y);
      pending = { ...pending, mh: Math.round(Math.min(mhMax, Math.max(mhMin, mh)) * 100) / 100 };
    } else if (drag.kind === 'gap') {
      // The handle sits at anchor + minApart: the gap the pointer shows becomes the spacing.
      const sp = Math.round(spacingForApart((p.x - drag.anchor) / sky.cellsPerUnit) * 100) / 100;
      // Spacing decides which mountains exist, so height edits (keyed by mountain) are set aside;
      // they come back if the drag returns to where it started.
      const back = sp === drawn.sp && shelved !== null;
      pending = { ...pending, sp, heights: back ? { ...shelved! } : {} };
    } else {
      const rise = Math.max(1, drag.rise0 + (drag.y0 - p.y));
      const s = (drag.scale0 * rise) / drag.rise0;
      const scale = Math.round(Math.min(MAX_HEIGHT_SCALE, Math.max(MIN_HEIGHT_SCALE, s)) * 100) / 100;
      const heights = { ...pending.heights };
      if (Math.abs(scale - 1) < 0.01) delete heights[drag.index];
      else heights[drag.index] = scale;
      pending = { ...pending, heights };
    }
    recompute();
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const target = pick(e);
    if (!target) return;
    canvas.setPointerCapture(e.pointerId);
    const p = at(e);
    if (target.kind === 'gap') {
      drag = { kind: 'gap', anchor: ruler().a };
      if (Object.keys(pending.heights).length) shelved = { ...pending.heights };
    } else if (target.kind === 'line') {
      drag = { kind: 'line', y0: p.y, mh0: pending.mh };
      guideY = p.py;
    } else {
      const m = target.m;
      drag = { kind: 'mountain', index: m.index, y0: p.y, scale0: pending.heights[m.index] ?? 1, rise0: Math.max(1, m.foot - m.peakY) };
    }
    hover = target;
    draw();
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.kind === 'gap' && pending.sp === drawn.sp) shelved = null;
    drag = null;
    recompute();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => {
    if (drag || !hover) return;
    hover = null;
    recompute();
  });
  canvas.addEventListener('dblclick', (e) => {
    const target = pick(e);
    if (target?.kind !== 'mountain' || pending.heights[target.m.index] === undefined) return;
    const heights = { ...pending.heights };
    delete heights[target.m.index];
    pending = { ...pending, heights };
    recompute();
  });

  function redraw(): void {
    drawn = { ...pending, heights: { ...pending.heights } };
    shelved = null;
    opts.params.mountainHeight = drawn.mh;
    opts.params.spacing = drawn.sp;
    recompute();
    opts.onRedraw();
  }

  function sync(): void {
    // Height and spacing can come from elsewhere (a level's params): adopt them unless an edit is pending.
    const fresh = { mh: opts.params.mountainHeight, sp: opts.params.spacing };
    if (same(pending, drawn)) pending = { ...pending, ...fresh };
    drawn = { ...drawn, ...fresh };
    recompute();
  }

  function reset(): void {
    drawn = { mh: opts.params.mountainHeight, sp: opts.params.spacing, heights: {} };
    pending = { ...drawn, heights: {} };
    shelved = null;
    recompute();
  }

  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => draw()).observe(canvas);

  return {
    node,
    sync,
    edits: () => ({ mountainHeight: drawn.mh, spacing: drawn.sp, heights: { ...drawn.heights } }),
    reset,
  };
}
