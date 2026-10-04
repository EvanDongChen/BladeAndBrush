/**
 * Dev check (bench/gpu-check.html): draws scenes through the CPU ink layer (ArtFrame.update) and the
 * GPU one (core/gpuArt.ts) and compares every pixel. Results in window.__gpuCheck.
 */
import '../src/pages/bootstrap';
import { ArtFrame } from '../src/core/artFrame';
import { resampleArt } from '../src/core/artResample';
import { artView, type ArtView } from '../src/core/blueprint';
import { El, elements, hash3 } from '../src/core/elements';
import { GpuArt } from '../src/core/gpuArt';
import { defaultParams } from '../src/core/params';
import { World } from '../src/core/world';
import { Frontier } from '../src/gen/frontier';
import { generate } from '../src/gen/generate';
import { step } from '../src/sim/step';

const id = (name: string) => elements.all().find((e) => e.name === name)!.id;
const gpu = new GpuArt();
const results: Record<string, unknown>[] = [];

function compare(name: string, world: World, view: ArtView | undefined, k: number, fx = world.w) {
  const out = new Uint32Array(world.w * k * world.h * k);
  new ArtFrame().update(out, world, view, fx, k, true);
  gpu.prepare(view, world.w, world.h, k);
  const f = new ArtFrame();
  const rects = f.updateCells(gpu.target!, world, view, fx, k, true);
  gpu.upload(rects, f.rectCount);
  gpu.draw(world.tick, true);
  const got = gpu.read();
  const cpu = new Uint8Array(out.buffer);
  let differ = 0;
  let worst = 0;
  let worstAt = -1;
  const hist = [0, 0, 0, 0, 0];
  for (let i = 0; i < out.length; i++) {
    const a = cpu[i * 4 + 3];
    const b = got[i * 4 + 3];
    let d = Math.abs(a - b);
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs((cpu[i * 4 + c] * a - got[i * 4 + c] * b) / 255));
    if (d >= 1) differ++;
    hist[Math.min(4, Math.floor(d / 2))]++;
    if (d > worst) {
      worst = d;
      worstAt = i;
    }
  }
  const W = world.w * k;
  results.push({
    name,
    pixels: out.length,
    differ,
    worst: Math.round(worst * 10) / 10,
    worstAt: worstAt < 0 ? null : [worstAt % W, Math.floor(worstAt / W)],
    cpuPx: worstAt < 0 ? null : Array.from(cpu.subarray(worstAt * 4, worstAt * 4 + 4)),
    gpuPx: worstAt < 0 ? null : Array.from(got.subarray(worstAt * 4, worstAt * 4 + 4)),
    hist,
  });
}

if (!gpu.ok) results.push({ error: 'GpuArt not ok (no WebGL2, or the program did not build: see console)' });
else {
  // every shader family, no art (like the golden test)
  const w = new World({ w: 72, h: 48 }, 7, defaultParams());
  const put = (x: number, y: number, e: number, life = 0) => w.set(x, y, e, { aux: hash3(x, y, 5), life });
  for (let x = 0; x < 30; x++) for (let y = 30 + ((x * 7) % 5 === 0 ? 1 : 0); y < 48; y++) put(x, y, El.WATER);
  for (let y = 32; y < 48; y++) for (let x = 44; x < 72; x++) if ((x - 58) ** 2 / 2 + (y - 48) ** 2 < 200) put(x, y, El.ROCK);
  for (let y = 10; y < 32; y++) put(50, y, El.TREE), put(51, y, El.TREE);
  for (let x = 40; x < 46; x++) put(x, 20, id('wood'));
  for (let y = 6; y < 14; y++) for (let x = 54; x < 62; x++) put(x, y, El.FIRE, 20 + (x + y) * 4);
  for (let y = 2; y < 9; y++) for (let x = 4; x < 16; x++) if ((x * y) % 3) put(x, y, El.SMOKE);
  for (let y = 12; y < 26; y += 3) for (let x = 6; x < 26; x += 4) put(x, y, id('rain'));
  for (const [n, x] of [['person', 64], ['bird', 66], ['flower', 68]] as const) for (let y = 2; y < 6; y++) put(x, y, id(n)), put(x + 1, y, id(n));
  for (const t of [0, 37]) {
    w.tick = t;
    compare(`shaders k=4 tick ${t}`, w, undefined, 4);
  }
  compare('shaders k=2', w, undefined, 2);

  // a generated painting, revealed, cut, flooded and burning
  const params = defaultParams();
  const bp = generate(3, params, { k: 4 });
  const full = artView(bp)!;
  const pw = new World(bp, 3, params);
  new Frontier(bp).revealAll(pw);
  compare('painting k=4 untouched', pw, full, 4);
  pw.clearCircle(300, 150, 25, { cut: true });
  for (let y = 120; y < 200; y++) for (let x = 500; x < 620; x++) if (pw.el[y * pw.w + x] === El.EMPTY) pw.set(x, y, El.WATER);
  let lit = 0;
  for (let i = 0; i < pw.size && lit < 120; i++) if (pw.el[i] === El.TREE) (pw.set(i % pw.w, (i / pw.w) | 0, El.FIRE, { aux: El.TREE, life: 70 }), lit++);
  for (let i = 0; i < 20; i++) step(pw);
  compare('painting k=4 cut+water+fire', pw, full, 4);
  compare('painting k=2 cut+water+fire', pw, resampleArt(full, 2), 2);
  compare('painting k=4 half unrolled', pw, full, 4, 400);
}
(globalThis as unknown as { __gpuCheck: unknown }).__gpuCheck = results;
document.getElementById('out')!.textContent = JSON.stringify(results, null, 1);
