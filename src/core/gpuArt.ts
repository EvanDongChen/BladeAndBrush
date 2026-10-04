import { prepareArt } from './artCompose';
import type { ArtRect, CellTarget } from './artFrame';
import type { ArtView } from './blueprint';
import { El } from './elements';
import { RUN_DEPTH, type CellRecords } from './shadeCells';
import { shaders, texture, type Shader } from './shaders';

/**
 * The ink layer on the GPU (WebGL2). The CPU still decides everything per cell, with the same code
 * as the CPU path (ArtFrame: which tiles changed, compose's case per cell, shadeCells' donor,
 * occupancy key, base colors and water depth); this draws every art pixel from those per-cell
 * records in one fragment shader: the composite of the art planes, the soft B-spline edges, the
 * color blend and each shader's look (its `glsl` twin). Same arithmetic as the CPU path, so the
 * picture matches it to within a rounding step. Only the tiles that changed are uploaded.
 *
 * Falls back (ok = false) when WebGL2 is missing, the program does not build, the context is lost,
 * or a shader has no GLSL twin; the art layer then draws on the CPU.
 */
export class GpuArt {
  readonly canvas: HTMLCanvasElement;
  ok = false;
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private progVersion = -1;
  private ids = new Map<Shader, number>();
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private tex: Record<string, WebGLTexture> = {};
  private w = 0;
  private h = 0;
  private k = 0;
  private view: ArtView | undefined | null = null;
  private planes = 0;
  /** CPU side of the per-cell textures (filled by ArtFrame.updateCells). */
  target: CellTarget | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) return;
    this.gl = gl;
    this.canvas.addEventListener('webglcontextlost', () => (this.ok = false));
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.tex.noise = this.texArray(gl.R8, 256, 256, 3);
    const names = ['flow', 'hatch', 'cloud'] as const;
    names.forEach((n, layer) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, 256, 256, 1, gl.RED, gl.UNSIGNED_BYTE, texture(n)));
    this.ok = this.build();
  }

  /** Size the per-cell textures and upload the painting's static art (when the grid, k or painting changes). */
  prepare(view: ArtView | undefined, w: number, h: number, k: number): void {
    const gl = this.gl;
    if (!gl || !this.ok) return;
    if (this.progVersion !== shaders.version) this.ok = this.build();
    if (!this.ok) return;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      const rec = new Uint32Array(w * h * 4);
      const cells: CellRecords = {
        rec,
        recF: new Float32Array(rec.buffer),
        color: new Uint32Array(w * h),
        shaderId: (sh) => this.ids.get(sh) ?? 0,
      };
      this.target = { codes: new Uint32Array(w * h), cells };
      this.replace('codes', this.tex2d(gl.R32UI, w, h));
      this.replace('rec', this.tex2d(gl.RGBA32UI, w, h));
      this.replace('color', this.tex2d(gl.RGBA8, w, h));
      this.view = null;
    }
    if (view === this.view && k === this.k) return;
    this.view = view;
    this.k = k;
    this.canvas.width = w * k;
    this.canvas.height = h * k;
    const aw = w * k;
    const ah = h * k;
    if (view) {
      const P = view.art.planes.length;
      this.planes = P;
      const arr = this.texArray(gl.RGBA8, aw, ah, P + 1);
      const bytes = (a: Uint32Array) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      for (let q = 0; q < P; q++) gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, q, aw, ah, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes(view.art.planes[q]));
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, P, aw, ah, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes(view.art.bg));
      this.replace('planes', arr);
      const init = this.tex2d(gl.RGBA8, aw, ah);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, aw, ah, gl.RGBA, gl.UNSIGNED_BYTE, bytes(prepareArt(view).initial));
      this.replace('initial', init);
      // per cell: which planes have a cell of their own here (compose skips their spill)
      const occ = new Uint32Array(w * h);
      for (let q = 0; q < P && q < 32; q++) {
        const pe = view.planes[q].el;
        for (let i = 0; i < occ.length; i++) if (pe[i] !== El.EMPTY) occ[i] |= 1 << q;
      }
      const ot = this.tex2d(gl.R32UI, w, h);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED_INTEGER, gl.UNSIGNED_INT, occ);
      this.replace('occ', ot);
    } else {
      this.planes = 0;
      this.replace('planes', this.texArray(gl.RGBA8, 1, 1, 1));
      this.replace('initial', this.tex2d(gl.RGBA8, 1, 1));
      this.replace('occ', this.tex2d(gl.R32UI, 1, 1));
    }
  }

  /** Upload the per-cell records of the changed cell rectangles. */
  upload(rects: readonly ArtRect[], count: number): void {
    const gl = this.gl;
    const t = this.target;
    if (!gl || !this.ok || !t) return;
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, this.w);
    const colorBytes = new Uint8Array(t.cells.color.buffer);
    for (let r = 0; r < count; r++) {
      const { x, y, w, h } = rects[r];
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
      gl.bindTexture(gl.TEXTURE_2D, this.tex.codes);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RED_INTEGER, gl.UNSIGNED_INT, t.codes);
      gl.bindTexture(gl.TEXTURE_2D, this.tex.rec);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA_INTEGER, gl.UNSIGNED_INT, t.cells.rec);
      // base colors are also written for the neighbours a drawn cell blends with: one cell more each side
      const cx0 = Math.max(0, x - 1);
      const cy0 = Math.max(0, y - 1);
      const cx1 = Math.min(this.w, x + w + 1);
      const cy1 = Math.min(this.h, y + h + 1);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, cx0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, cy0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex.color);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, cx0, cy0, cx1 - cx0, cy1 - cy0, gl.RGBA, gl.UNSIGNED_BYTE, colorBytes);
    }
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  }

  /** Draw every art pixel into this.canvas. */
  draw(tick: number, shaded: boolean): void {
    const gl = this.gl;
    if (!gl || !this.ok || !this.prog) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    const units: [string, string, number][] = [
      ['uPlanes', 'planes', gl.TEXTURE_2D_ARRAY],
      ['uInitial', 'initial', gl.TEXTURE_2D],
      ['uOcc', 'occ', gl.TEXTURE_2D],
      ['uCode', 'codes', gl.TEXTURE_2D],
      ['uRec', 'rec', gl.TEXTURE_2D],
      ['uColor', 'color', gl.TEXTURE_2D],
      ['uTex', 'noise', gl.TEXTURE_2D_ARRAY],
    ];
    units.forEach(([u, t, kind], n) => {
      gl.activeTexture(gl.TEXTURE0 + n);
      gl.bindTexture(kind, this.tex[t]);
      gl.uniform1i(this.loc[u], n);
    });
    gl.uniform1i(this.loc.uK, this.k);
    gl.uniform1i(this.loc.uW, this.w);
    gl.uniform1i(this.loc.uH, this.h);
    gl.uniform1i(this.loc.uP, this.planes);
    gl.uniform1i(this.loc.uTick, tick);
    gl.uniform1i(this.loc.uHasArt, this.view ? 1 : 0);
    gl.uniform1i(this.loc.uShaded, shaded ? 1 : 0);
    gl.uniform1f(this.loc.uRunDepth, RUN_DEPTH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** The last drawn frame as art-pixel RGBA rows, top row first (for checks against the CPU path). */
  read(): Uint8Array {
    const gl = this.gl!;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const flipped = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, flipped);
    const out = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) out.set(flipped.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    return out;
  }

  // ---- WebGL plumbing ----

  private replace(name: string, t: WebGLTexture): void {
    if (this.tex[name]) this.gl!.deleteTexture(this.tex[name]);
    this.tex[name] = t;
  }

  private tex2d(fmt: number, w: number, h: number): WebGLTexture {
    const gl = this.gl!;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h);
    nearest(gl, gl.TEXTURE_2D);
    return t;
  }

  private texArray(fmt: number, w: number, h: number, layers: number): WebGLTexture {
    const gl = this.gl!;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, fmt, w, h, layers);
    nearest(gl, gl.TEXTURE_2D_ARRAY);
    return t;
  }

  /** (Re)build the program from every registered shader's GLSL twin. False if one has none or it fails. */
  private build(): boolean {
    const gl = this.gl;
    if (!gl) return false;
    this.progVersion = shaders.version;
    const list = shaders.all();
    if (list.some((s) => !s.glsl)) return false;
    this.ids = new Map(list.map((s, n) => [s, n + 1]));
    const fns = list.map((s, n) => `ivec4 shade_${n + 1}(Px p) {${s.glsl}\n}`).join('\n');
    const dispatch = list.map((_, n) => `  if (id == ${n + 1}) return shade_${n + 1}(p);`).join('\n');
    const fs = FRAG.replace('/*SHADERS*/', `${fns}\nivec4 runShader(int id, Px p) {\n${dispatch}\n  return ivec4(0);\n}`);
    const prog = link(gl, VERT, fs);
    if (!prog) return false;
    if (this.prog) gl.deleteProgram(this.prog);
    this.prog = prog;
    this.loc = {};
    for (const u of ['uPlanes', 'uInitial', 'uOcc', 'uCode', 'uRec', 'uColor', 'uTex', 'uK', 'uW', 'uH', 'uP', 'uTick', 'uHasArt', 'uShaded', 'uRunDepth']) {
      this.loc[u] = gl.getUniformLocation(prog, u);
    }
    return true;
  }
}

function nearest(gl: WebGL2RenderingContext, target: number): void {
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('gpuArt: shader did not compile, drawing on the CPU\n', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const v = compile(gl.VERTEX_SHADER, vs);
  const f = compile(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram()!;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('gpuArt: program did not link, drawing on the CPU\n', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

/** One triangle that covers the whole canvas. */
const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * Per art pixel: compose() from the cell's code, then the cell's shader (if any) from its record,
 * exactly as shadeCells/paintCell do it. Colors are ivec4 0..255 straight alpha, rounded where the
 * CPU rounds (JS Math.round = floor(x + 0.5); `| 0` and byte() = floor, clamped).
 */
const FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
precision highp sampler2DArray;

uniform highp sampler2DArray uPlanes;
uniform highp sampler2D uInitial;
uniform highp usampler2D uOcc;
uniform highp usampler2D uCode;
uniform highp usampler2D uRec;
uniform highp sampler2D uColor;
uniform highp sampler2DArray uTex;
uniform int uK, uW, uH, uP, uTick, uHasArt, uShaded;
uniform float uRunDepth;
out vec4 outColor;

struct Px { float x, y, cx, cy, fx, fy, cover, v, depth; bool topEdge; float tick, aux, life, i; ivec4 base; };

float rnd(float x) { return floor(x + 0.5); }
int byteF(float v) { return int(clamp(floor(v), 0.0, 255.0)); }
ivec4 px8(vec4 c) { return ivec4(floor(c * 255.0 + 0.5)); }
float ss(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
ivec3 mixc(ivec3 a, ivec3 b, float t) {
  return ivec3(byteF(float(a.r) + float(b.r - a.r) * t), byteF(float(a.g) + float(b.g - a.g) * t), byteF(float(a.b) + float(b.b - a.b) * t));
}
/** Shader texture 0..1 (0 flow, 1 hatch, 2 cloud), tiling every 256. */
float tex(int layer, float u, float v) { return texelFetch(uTex, ivec3(int(floor(u)) & 255, int(floor(v)) & 255, layer), 0).r; }

ivec4 over(ivec4 t, ivec4 u) {
  if (t.a == 255) return t;
  if (t.a == 0) return u;
  float ta = float(t.a);
  float ub = float(u.a) * (255.0 - ta) / 255.0;
  float oa = ta + ub;
  if (oa <= 0.0) return ivec4(0);
  vec3 c = (vec3(t.rgb) * ta + vec3(u.rgb) * ub) / oa;
  return ivec4(int(rnd(c.r)), int(rnd(c.g)), int(rnd(c.b)), int(rnd(oa)));
}

ivec4 planePx(int q, ivec2 p) { return px8(texelFetch(uPlanes, ivec3(p, q), 0)); }

ivec4 composePx(ivec2 p, ivec2 cell) {
  if (uHasArt == 0) return ivec4(0);
  uint code = texelFetch(uCode, cell, 0).r;
  uint cs = code & 7u;
  if (cs == 0u) return ivec4(0);
  if (cs == 1u) return px8(texelFetch(uInitial, p, 0));
  if (cs == 2u) {
    uint mask = (code >> 8u) & 65535u;
    ivec4 acc = over(planePx(uP, p), ivec4(0));
    for (int q = uP - 1; q >= 0; q--) if (((mask >> uint(q)) & 1u) != 0u) acc = over(planePx(q, p), acc);
    return acc;
  }
  int from = cs == 3u ? uP : int((code >> 3u) & 31u);
  uint occ = texelFetch(uOcc, cell, 0).r;
  ivec4 acc = over(planePx(uP, p), ivec4(238, 230, 212, 255));
  for (int q = uP - 1; q >= 0; q--) {
    if (q < from && ((occ >> uint(q)) & 1u) != 0u) continue;
    acc = over(planePx(q, p), acc);
  }
  return acc;
}

/** Cubic B-spline taps for sub-pixel s: base offset b and the four weights. */
void taps(int s, out int b, out vec4 wt) {
  float u = (float(s) + 0.5) / float(uK) - 0.5;
  b = u < 0.0 ? -1 : 0;
  float f = u - float(b);
  float g = 1.0 - f;
  wt = vec4(g * g * g / 6.0, (3.0 * f * f * f - 6.0 * f * f + 4.0) / 6.0, (-3.0 * f * f * f + 3.0 * f * f + 3.0 * f + 1.0) / 6.0, f * f * f / 6.0);
}

float bit(uint key, int n) { return float((key >> uint(n)) & 1u); }

/*SHADERS*/

void main() {
  ivec2 fc = ivec2(gl_FragCoord.xy);
  ivec2 p = ivec2(fc.x, uH * uK - 1 - fc.y);
  ivec2 cell = p / uK;
  ivec4 res = composePx(p, cell);
  if (uShaded != 0) {
    uvec4 r = texelFetch(uRec, cell, 0);
    int id = int(r.g & 255u);
    if (id != 0) {
      uint key = r.r;
      int sx = p.x - cell.x * uK;
      int sy = p.y - cell.y * uK;
      int bx, by;
      vec4 wx, wy;
      taps(sx, bx, wx);
      taps(sy, by, wy);
      float v = 0.0;
      for (int j = 0; j < 4; j++) {
        int row = (by + 1 + j) * 5;
        float rs = 0.0;
        for (int i = 0; i < 4; i++) rs += wx[i] * bit(key, row + bx + 1 + i);
        v += wy[j] * rs;
      }
      float cover = ss(0.22, 0.56, v);
      if (cover > 0.01) {
        Px px;
        px.x = float(p.x);
        px.y = float(p.y);
        px.cx = float(cell.x);
        px.cy = float(cell.y);
        px.fx = (float(sx) + 0.5) / float(uK);
        px.fy = (float(sy) + 0.5) / float(uK);
        px.cover = cover;
        px.v = v < 0.44 ? v : 0.44 + (v - 0.44) * 1.3;
        bool isRun = (r.g & 1024u) != 0u;
        float pos = uintBitsToFloat(r.a);
        px.depth = isRun ? max(0.0, min(1.0, (pos + px.fy) / uRunDepth)) : 0.0;
        px.topEdge = (r.g & 256u) != 0u;
        px.tick = float(uTick);
        px.aux = float((r.g >> 16u) & 255u);
        px.life = float(r.g >> 24u);
        int ref = int(r.b);
        px.i = float(ref);
        px.base = ivec4(0);
        if ((r.g & 512u) != 0u) {
          // blend the colors of the four nearest cells, weighted by occupancy
          float ux = px.fx - 0.5;
          float uy = px.fy - 0.5;
          int dxDir = ux < 0.0 ? -1 : 1;
          int dyDir = uy < 0.0 ? -1 : 1;
          float ax = abs(ux);
          float ay = abs(uy);
          vec4 acc = vec4(0.0);
          float ws = 0.0;
          for (int t = 0; t < 4; t++) {
            int ddx = (t & 1) != 0 ? dxDir : 0;
            int ddy = (t & 2) != 0 ? dyDir : 0;
            ivec2 nb = cell + ivec2(ddx, ddy);
            if (nb.x < 0 || nb.y < 0 || nb.x >= uW || nb.y >= uH) continue;
            if (bit(key, (ddy + 2) * 5 + ddx + 2) == 0.0) continue;
            ivec4 c = px8(texelFetch(uColor, nb, 0));
            if (c == ivec4(0)) continue;
            float wgt = ((t & 1) != 0 ? ax : 1.0 - ax) * ((t & 2) != 0 ? ay : 1.0 - ay);
            acc += wgt * vec4(c);
            ws += wgt;
          }
          px.base = ws > 0.001 ? ivec4(acc / ws) : px8(texelFetch(uColor, ivec2(ref % uW, ref / uW), 0));
        }
        ivec4 c = runShader(id, px);
        int a = int(rnd(float(c.a) * cover));
        if (a > 0) {
          ivec4 col = ivec4(c.rgb, a);
          res = res == ivec4(0) ? col : over(col, res);
        }
      }
    }
  }
  outColor = vec4(res) / 255.0;
}`;
