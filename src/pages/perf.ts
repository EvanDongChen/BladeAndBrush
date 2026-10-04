/**
 * Frame profiler for the pages: add `?perf` to any page URL. Shows a small overlay with the real
 * frame rate, the time the sim ticks take, each render layer's draw time, and everything else in
 * the frame callback (overlays, UI, scans). Also exposes the rolling numbers as `window.__perf`
 * so `npm run bench:browser` can read them.
 *
 * Only the CPU side is timed per layer; the GPU work of an upload (putImageData / drawImage) can
 * land in the next frame, which shows up in the frame interval rather than in a layer.
 */
import { layers } from '../core/render';

const WINDOW = 120; // frames in the rolling window

class Series {
  private readonly v = new Float64Array(WINDOW);
  private n = 0;
  add(x: number): void {
    this.v[this.n++ % WINDOW] = x;
  }
  get count(): number {
    return Math.min(this.n, WINDOW);
  }
  mean(): number {
    const c = this.count;
    let s = 0;
    for (let i = 0; i < c; i++) s += this.v[i];
    return c ? s / c : 0;
  }
  max(): number {
    const c = this.count;
    let m = 0;
    for (let i = 0; i < c; i++) m = Math.max(m, this.v[i]);
    return m;
  }
}

export interface PerfSnapshot {
  fps: number;
  frameMs: { mean: number; max: number };
  simMs: { mean: number; max: number };
  ticksPerFrame: number;
  callbackMs: { mean: number; max: number };
  layers: Record<string, { mean: number; max: number }>;
  /** Canvas calls per frame: time (CPU side) and count. */
  canvas: Record<string, { mean: number; max: number; calls: number }>;
  otherMs: { mean: number; max: number };
}

export const perfEnabled = typeof location !== 'undefined' && new URLSearchParams(location.search).has('perf');

const interval = new Series();
const sim = new Series();
const ticks = new Series();
const callback = new Series();
const other = new Series();
const layerSeries = new Map<string, Series>();
let layerSum = 0;
let wrapped = false;
let box: HTMLElement | null = null;
let lastPaint = 0;

const canvasCalls = ['putImageData', 'drawImage', 'getImageData'] as const;
const canvasMs = new Map<string, Series>(canvasCalls.map((n) => [n, new Series()]));
const canvasCount = new Map<string, Series>(canvasCalls.map((n) => [n, new Series()]));
const frameMs = new Map<string, number>();
const frameCount = new Map<string, number>();

if (perfEnabled) {
  Object.defineProperty(globalThis, '__perf', { configurable: true, get: perfSnapshot });
  // time the expensive canvas calls (they can hide inside a layer's draw)
  const proto = CanvasRenderingContext2D.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const name of canvasCalls) {
    const orig = proto[name];
    proto[name] = function (this: unknown, ...a: unknown[]) {
      const t = performance.now();
      const r = orig.apply(this, a);
      frameMs.set(name, (frameMs.get(name) ?? 0) + performance.now() - t);
      frameCount.set(name, (frameCount.get(name) ?? 0) + 1);
      return r;
    };
  }
}

/** Wrap every registered layer's draw so its time is recorded (once). */
function wrapLayers(): void {
  if (wrapped) return;
  wrapped = true;
  for (const l of layers.all()) {
    const draw = l.draw;
    const s = new Series();
    layerSeries.set(l.name, s);
    l.draw = (rc) => {
      const t = performance.now();
      draw(rc);
      const d = performance.now() - t;
      s.add(d);
      layerSum += d;
    };
  }
}

export function perfSnapshot(): PerfSnapshot {
  const ms = (s: Series) => ({ mean: s.mean(), max: s.max() });
  const fm = interval.mean();
  return {
    fps: fm > 0 ? 1000 / fm : 0,
    frameMs: ms(interval),
    simMs: ms(sim),
    ticksPerFrame: ticks.mean(),
    callbackMs: ms(callback),
    layers: Object.fromEntries([...layerSeries].map(([k, s]) => [k, ms(s)])),
    canvas: Object.fromEntries(canvasCalls.map((n) => [n, { ...ms(canvasMs.get(n)!), calls: canvasCount.get(n)!.mean() }])),
    otherMs: ms(other),
  };
}

/** Called by startLoop around each part of a frame. */
export const perf = {
  frameStart(intervalMs: number): void {
    wrapLayers();
    if (intervalMs > 0) interval.add(intervalMs);
    layerSum = 0;
  },
  sim(ms: number, n: number): void {
    sim.add(ms);
    ticks.add(n);
  },
  frameEnd(callbackMs: number): void {
    callback.add(callbackMs);
    for (const n of canvasCalls) {
      canvasMs.get(n)!.add(frameMs.get(n) ?? 0);
      canvasCount.get(n)!.add(frameCount.get(n) ?? 0);
      frameMs.set(n, 0);
      frameCount.set(n, 0);
    }
    other.add(Math.max(0, callbackMs - layerSum));
    const now = performance.now();
    if (now - lastPaint > 500) {
      lastPaint = now;
      paint();
    }
  },
};

function paint(): void {
  if (!box) {
    box = document.createElement('pre');
    box.style.cssText =
      'position:fixed;top:8px;right:8px;z-index:9999;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;' +
      'background:rgba(20,20,20,.82);color:#e8e2d0;border-radius:4px;pointer-events:none;white-space:pre';
    document.body.append(box);
  }
  const p = perfSnapshot();
  const f = (x: { mean: number; max: number }) => `${x.mean.toFixed(1).padStart(5)} ${x.max.toFixed(1).padStart(6)}`;
  const rows = [
    `fps ${p.fps.toFixed(0).padStart(3)}            mean    max`,
    `frame interval  ${f(p.frameMs)}`,
    `sim (${p.ticksPerFrame.toFixed(1)} ticks)  ${f(p.simMs)}`,
    `frame callback  ${f(p.callbackMs)}`,
    ...Object.entries(p.layers)
      .filter(([, v]) => v.max > 0)
      .map(([k, v]) => `  layer ${k.padEnd(9)} ${f(v)}`),
    `  other         ${f(p.otherMs)}`,
    ...Object.entries(p.canvas)
      .filter(([, v]) => v.max > 0)
      .map(([k, v]) => `${k.padEnd(13)} ${f(v)}  x${v.calls.toFixed(1)}`),
  ];
  box.textContent = rows.join('\n');
}
