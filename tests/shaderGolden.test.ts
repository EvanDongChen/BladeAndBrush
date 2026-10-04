import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import '../src/pages/bootstrap';
import { El, hash3, elements } from '../src/core/elements';
import { defaultParams } from '../src/core/params';
import { shadeCells } from '../src/core/shadeCells';
import { World } from '../src/core/world';

/**
 * Golden images of every shader family (water, solids, fire, gases, rain, sprites), so speedups of
 * the shading code cannot quietly change the look. `UPDATE_GOLDEN=1 npx vitest run
 * tests/shaderGolden.test.ts` rewrites the fixture (only do that for an intended change of look).
 * Rounding may differ by a step: each channel may move by at most TOLERANCE (colours weighted by
 * alpha, so an almost transparent pixel's colour does not count).
 */
const K = 4;
const TOLERANCE = 2;
const FIXTURE = join(__dirname, 'fixtures', 'shader-golden.bin.gz');

const id = (name: string) => elements.all().find((e) => e.name === name)!.id;

function scene(): World {
  const w = new World({ w: 72, h: 48 }, 7, defaultParams());
  const put = (x: number, y: number, e: number, life = 0) => w.set(x, y, e, { aux: hash3(x, y, 5), life });
  // a pond with an uneven surface and a puddle (run depths, waterline, spill)
  for (let x = 0; x < 30; x++) for (let y = 30 + ((x * 7) % 5 === 0 ? 1 : 0); y < 48; y++) put(x, y, El.WATER);
  for (let x = 34; x < 40; x++) put(x, 46, El.WATER);
  // a rock heap, a tree trunk, loose wood, ash and earth
  for (let y = 32; y < 48; y++) for (let x = 44; x < 72; x++) if ((x - 58) ** 2 / 2 + (y - 48) ** 2 < 200) put(x, y, El.ROCK);
  for (let y = 10; y < 32; y++) put(50, y, El.TREE), put(51, y, El.TREE);
  for (let x = 40; x < 46; x++) put(x, 20, id('wood'));
  for (let x = 30; x < 44; x += 2) put(x, 44 - (x % 3), El.ASH);
  // fire with a life ramp
  for (let y = 6; y < 14; y++) for (let x = 54; x < 62; x++) put(x, y, El.FIRE, 20 + (x + y) * 4);
  // smoke and steam clouds
  for (let y = 2; y < 9; y++) for (let x = 4; x < 16; x++) if ((x * y) % 3) put(x, y, El.SMOKE);
  for (let y = 2; y < 8; y++) for (let x = 20; x < 30; x++) put(x, y, id('steam'));
  // rain streaks
  for (let y = 12; y < 26; y += 3) for (let x = 6; x < 26; x += 4) put(x, y, id('rain'));
  // sprite cells (just their look, not live creatures)
  for (const [n, x] of [['person', 64], ['bird', 66], ['flower', 68], ['butterfly', 70]] as const) {
    for (let y = 2; y < 6; y++) put(x, y, id(n)), put(x + 1, y, id(n));
  }
  return w;
}

/** Shade the scene at a few ticks (the animated shaders move). */
function render(): Uint32Array {
  const w = scene();
  const frame = w.w * K * w.h * K;
  const ticks = [0, 37, 200];
  const out = new Uint32Array(frame * ticks.length);
  ticks.forEach((t, n) => {
    w.tick = t;
    shadeCells(out.subarray(n * frame, (n + 1) * frame), w, K, undefined, w.w);
  });
  return out;
}

describe('shader golden images', () => {
  it('every shader family looks the same as the recorded images', () => {
    const got = render();
    if (process.env.UPDATE_GOLDEN || !existsSync(FIXTURE)) {
      writeFileSync(FIXTURE, gzipSync(Buffer.from(got.buffer)));
      return;
    }
    const raw = gunzipSync(readFileSync(FIXTURE));
    const want = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    expect(want.length).toBe(got.length);
    let worst = 0;
    let worstAt = -1;
    let differ = 0;
    for (let i = 0; i < got.length; i++) {
      const a = got[i];
      const b = want[i];
      if (a === b) continue;
      differ++;
      const aa = a >>> 24;
      const ba = b >>> 24;
      let d = Math.abs(aa - ba);
      for (const s of [0, 8, 16]) d = Math.max(d, Math.abs((((a >>> s) & 255) * aa - ((b >>> s) & 255) * ba) / 255));
      if (d > worst) {
        worst = d;
        worstAt = i;
      }
    }
    expect(worst, `worst channel difference (pixel ${worstAt}, ${differ} pixels differ at all)`).toBeLessThanOrEqual(TOLERANCE);
  });
});
