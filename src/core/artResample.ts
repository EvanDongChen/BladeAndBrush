import type { ArtBuffers, ArtView } from './blueprint';

const cache = new WeakMap<ArtBuffers, Map<number, ArtView>>();

/**
 * The same art at `k` pixels per cell instead of the generated art.k (k < art.k), for pages whose
 * canvas is shown smaller than the art: every per-pixel cost (compose, shaders, upload) drops with
 * k*k. Each output pixel is the area average (premultiplied alpha) of the source pixels it covers;
 * cell boundaries line up for any integer k, so a cell's pixels still come only from its own art.
 * Computed once per painting and k (cached).
 */
export function resampleArt(view: ArtView, k: number): ArtView {
  const src = view.art;
  if (k >= src.k || k < 1) return view;
  let byK = cache.get(src);
  if (!byK) cache.set(src, (byK = new Map()));
  let out = byK.get(k);
  if (out) return out;
  const sw = view.w * src.k;
  const sh = view.h * src.k;
  const dw = view.w * k;
  const dh = view.h * k;
  const cols = weights(sw, dw);
  const rows = weights(sh, dh);
  const art: ArtBuffers = {
    k,
    planes: src.planes.map((p) => resample(p, sw, dw, dh, cols, rows)),
    bg: resample(src.bg, sw, dw, dh, cols, rows),
  };
  out = { ...view, art };
  byK.set(k, out);
  return out;
}

interface Weights {
  /** Per output pixel o: `count[o]` sources, their indices `idx` and weights `w` from `off[o]`. */
  count: Uint8Array;
  off: Int32Array;
  idx: Int32Array;
  w: Float32Array;
}

/** Area weights from n source pixels onto m output pixels (m < n), each output's weights summing to 1. */
function weights(n: number, m: number): Weights {
  const f = n / m;
  const per = Math.ceil(f) + 1;
  const res: Weights = { count: new Uint8Array(m), off: new Int32Array(m), idx: new Int32Array(m * per), w: new Float32Array(m * per) };
  for (let o = 0; o < m; o++) {
    const a = o * f;
    const b = a + f;
    const s0 = Math.floor(a);
    res.off[o] = o * per;
    let c = 0;
    for (let s = s0; s < b && s < n; s++) {
      const cover = Math.min(b, s + 1) - Math.max(a, s);
      if (cover <= 1e-6) continue;
      res.idx[o * per + c] = s;
      res.w[o * per + c] = cover / f;
      c++;
    }
    res.count[o] = c;
  }
  return res;
}

function resample(src: Uint32Array, sw: number, dw: number, dh: number, cols: Weights, rows: Weights): Uint32Array {
  const dst = new Uint32Array(dw * dh);
  const acc = new Float32Array(dw * 4);
  for (let oy = 0; oy < dh; oy++) {
    acc.fill(0);
    let any = false;
    const ry = rows.off[oy];
    for (let t = 0; t < rows.count[oy]; t++) {
      const sy = rows.idx[ry + t];
      const wy = rows.w[ry + t];
      const row = sy * sw;
      for (let ox = 0; ox < dw; ox++) {
        const rx = cols.off[ox];
        for (let u = 0; u < cols.count[ox]; u++) {
          const c = src[row + cols.idx[rx + u]];
          const a = c >>> 24;
          if (a === 0) continue;
          any = true;
          const wa = wy * cols.w[rx + u] * a;
          const o = ox * 4;
          acc[o] += wa * (c & 255);
          acc[o + 1] += wa * ((c >>> 8) & 255);
          acc[o + 2] += wa * ((c >>> 16) & 255);
          acc[o + 3] += wa;
        }
      }
    }
    if (!any) continue;
    const base = oy * dw;
    for (let ox = 0; ox < dw; ox++) {
      const o = ox * 4;
      const a = acc[o + 3];
      if (a < 0.5) continue;
      const inv = 1 / a;
      const r = Math.round(acc[o] * inv);
      const g = Math.round(acc[o + 1] * inv);
      const b = Math.round(acc[o + 2] * inv);
      dst[base + ox] = ((Math.round(a) << 24) | (b << 16) | (g << 8) | r) >>> 0;
    }
  }
  return dst;
}
