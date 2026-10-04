import { adoptPrepared } from '../core/artCompose';
import { adoptResampled } from '../core/artResample';
import { artView, type ArtBuffers, type Blueprint } from '../core/blueprint';
import type { GenParams } from '../core/params';
import { generate, type GenerateOptions } from '../gen/generate';
import type { GenRequest } from './genWorker';

let worker: Worker | null = null;
let failed = false;
let nextId = 1;
const waiting = new Map<number, { resolve: (bp: Blueprint) => void; reject: (e: unknown) => void; k: number }>();

/**
 * generate() on a worker, so painting a level (or repainting after a slider) never freezes the
 * page. The art comes back already resampled to `k` (the page's canvas pixels per cell) and
 * composited once, and the render caches are primed with it. Falls back to generating here.
 */
export function generateAsync(seed: number, params: GenParams, opts: GenerateOptions, k: number): Promise<Blueprint> {
  if (!failed && !worker) {
    try {
      worker = new Worker(new URL('./genWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; bp: Blueprint; art: ArtBuffers | null; initial: Uint32Array | null }>) => {
        const { id, bp, art, initial } = e.data;
        const w = waiting.get(id);
        if (!w) return;
        waiting.delete(id);
        const full = artView(bp);
        if (full) {
          const view = art ? { ...full, art } : full;
          if (art) adoptResampled(full.art, view);
          if (initial) adoptPrepared(view, initial);
        }
        w.resolve(bp);
      };
      worker.onerror = (e) => {
        failed = true;
        worker = null;
        for (const w of waiting.values()) w.reject(e);
        waiting.clear();
      };
    } catch {
      failed = true;
    }
  }
  if (!worker) return Promise.resolve(generate(seed, params, opts));
  const id = nextId++;
  const req: GenRequest = { id, seed, params: { ...params }, opts, k };
  return new Promise<Blueprint>((resolve, reject) => {
    waiting.set(id, { resolve, reject, k });
    worker!.postMessage(req);
  }).catch(() => generate(seed, params, opts));
}
