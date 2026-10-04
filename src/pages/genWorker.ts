/**
 * Generation off the main thread: generate() (~1 s at k=4), the art resampled to the page's k and
 * its precomputed composite, posted back with every buffer transferred (no copies). See genClient.ts.
 */
import './bootstrap';
import { prepareArt } from '../core/artCompose';
import { resampleArt } from '../core/artResample';
import { artView } from '../core/blueprint';
import { generate, type GenerateOptions } from '../gen/generate';
import type { GenParams } from '../core/params';

export interface GenRequest {
  id: number;
  seed: number;
  params: GenParams;
  opts: GenerateOptions;
  /** The page's canvas pixels per cell. */
  k: number;
}

self.onmessage = (e: MessageEvent<GenRequest>) => {
  const { id, seed, params, opts, k } = e.data;
  const bp = generate(seed, params, opts);
  const full = artView(bp);
  const view = full && k < full.art.k ? resampleArt(full, k) : full;
  const initial = view ? prepareArt(view).initial : null;
  const buffers = new Set<ArrayBuffer>();
  const add = (v: unknown) => {
    if (ArrayBuffer.isView(v)) buffers.add(v.buffer as ArrayBuffer);
    else if (Array.isArray(v)) v.forEach(add);
    else if (v && typeof v === 'object' && !(v instanceof Map)) Object.values(v).forEach(add);
  };
  add(bp);
  if (view && view !== full) add(view.art);
  if (initial) buffers.add(initial.buffer as ArrayBuffer);
  (self as unknown as Worker).postMessage({ id, bp, art: view && view !== full ? view.art : null, initial }, [...buffers]);
};
