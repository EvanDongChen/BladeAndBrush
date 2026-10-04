import { over } from './artCompose';
import type { ArtView } from './blueprint';
import { FAR_PLANE, NO_PLANE } from './constants';
import { El, ELEMENTS, type CellView } from './elements';
import { FAMILY, RUN, resolveShaders, anyShader, sampleTexture, smoothstep, SHADER, type ShadePx } from './shaders';
import type { World } from './world';

/** A run shorter than this still gets a gentle gradient (a puddle does not go black at once). */
const MIN_RUN = 24;

const px: ShadePx = {
  x: 0, y: 0, cx: 0, cy: 0, fx: 0, fy: 0, cover: 1, v: 1, depth: 0, topEdge: false,
  tick: 0, aux: 0, life: 0, i: 0, base: 0,
  tex: sampleTexture,
};
const cellView: CellView = { x: 0, y: 0, el: 0, life: 0, aux: 0, owner: 0, flags: 0, tick: 0 };
const occ = new Float32Array(9);

let runPos = new Int16Array(0);
let runLen = new Int16Array(0);

/** For `run` shaders: where each cell sits in its vertical run of the same family. */
function computeRuns(world: World): boolean {
  const { w, h, el } = world;
  let any = false;
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      const e = el[y * w + x];
      if (!RUN[e]) {
        y++;
        continue;
      }
      if (!any) {
        any = true;
        if (runPos.length < world.size) {
          runPos = new Int16Array(world.size);
          runLen = new Int16Array(world.size);
        }
      }
      const fam = FAMILY[e];
      let y1 = y;
      while (y1 + 1 < h && FAMILY[el[(y1 + 1) * w + x]] === fam && RUN[el[(y1 + 1) * w + x]]) y1++;
      const len = y1 - y + 1;
      for (let yy = y; yy <= y1; yy++) {
        runPos[yy * w + x] = yy - y;
        runLen[yy * w + x] = len;
      }
      y = y1 + 1;
    }
  }
  return any;
}

/** True if compose() already drew this cell from the generator's art (so it needs no shading). */
function showsArt(world: World, view: ArtView, i: number): boolean {
  const we = world.el[i];
  const wp = world.plane[i];
  if (we === view.el[i] && wp === view.plane[i]) return true;
  if (wp === FAR_PLANE && we === El.ROCK) return true;
  return wp !== NO_PLANE && view.planes[wp]?.el[i] === we;
}

/**
 * Draw every shaded cell that is not showing generator art into `out` (art resolution, row width
 * w*k): soft edges from the neighbours of the same family, then the element's shader per pixel.
 */
export function shadeCells(out: Uint32Array, world: World, k: number, view: ArtView | undefined, frontierX: number): void {
  resolveShaders();
  if (!anyShader) return;
  const { w, h, el, aux, life, owner, flags } = world;
  const aw = w * k;
  const fxEnd = Math.min(w, frontierX);
  const haveRuns = computeRuns(world);
  px.tick = world.tick;
  cellView.tick = world.tick;
  const half = 0.5 / k;

  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < fxEnd; cx++) {
      const i = cy * w + cx;
      const e = el[i];
      const sh = SHADER[e];
      if (!sh) continue;
      if (view && showsArt(world, view, i)) continue;
      const fam = FAMILY[e];
      // 3x3 occupancy of this family (the world edge counts as occupied: bodies reach the wall)
      for (let j = -1; j <= 1; j++) {
        for (let d = -1; d <= 1; d++) {
          const nx = cx + d;
          const ny = cy + j;
          occ[(j + 1) * 3 + d + 1] = nx < 0 || ny < 0 || nx >= w || ny >= h ? 1 : FAMILY[el[ny * w + nx]] === fam && SHADER[el[ny * w + nx]] ? 1 : 0;
        }
      }
      const def = ELEMENTS[e];
      cellView.x = cx;
      cellView.y = cy;
      cellView.el = e;
      cellView.life = life[i];
      cellView.aux = aux[i];
      cellView.owner = owner[i];
      cellView.flags = flags[i];
      px.base = def ? def.color(cellView) : 0xffff00ff;
      px.aux = aux[i];
      px.life = life[i];
      px.i = i;
      px.cx = cx;
      px.cy = cy;
      px.topEdge = occ[1] < 1;
      const pos = haveRuns && RUN[e] ? runPos[i] : 0;
      const len = haveRuns && RUN[e] ? Math.max(MIN_RUN, runLen[i]) : 1;

      for (let sy = 0; sy < k; sy++) {
        const fy = (sy + 0.5) / k;
        const uy = fy - 0.5;
        const dy = uy < 0 ? 0 : 2;
        const ty = Math.abs(uy);
        const rowIdx = (cy * k + sy) * aw + cx * k;
        for (let sx = 0; sx < k; sx++) {
          const fx = (sx + 0.5) / k;
          const ux = fx - 0.5;
          const dx = ux < 0 ? 0 : 2;
          const tx = Math.abs(ux);
          // bilinear blend of the four nearest cell centres
          const v = (1 - tx) * (1 - ty) * 1 + tx * (1 - ty) * occ[3 + dx] + (1 - tx) * ty * occ[dy * 3 + 1] + tx * ty * occ[dy * 3 + dx];
          const cover = smoothstep(0.3, 0.7, v);
          if (cover <= 0.01) continue;
          px.x = cx * k + sx;
          px.y = cy * k + sy;
          px.fx = fx;
          px.fy = fy;
          px.cover = cover;
          px.v = v;
          px.depth = len > 1 ? (pos + fy) / len : 0;
          const c = sh.shade(px);
          const a = Math.round((c >>> 24) * cover);
          if (a <= 0) continue;
          const col = ((c & 0xffffff) | (a << 24)) >>> 0;
          const at = rowIdx + sx;
          out[at] = out[at] === 0 ? col : over(col, out[at]);
        }
      }
    }
  }
  void half;
}
