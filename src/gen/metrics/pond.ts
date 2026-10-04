import { El } from '../../core/elements';
import { registerMetric } from '../../core/scan';
import { skyReach } from '../scan';

/**
 * Cells in the biggest pond: a connected (4-connected) body of WATER that lies open to the sky
 * somewhere along its surface. Water sealed inside rock (a spring's hollow) is not a pond.
 */
registerMetric(
  'largestPond',
  (world) => {
    const { w, h, el, size } = world;
    let sky: Uint8Array | null = null;
    const seen = new Uint8Array(size);
    const stack = new Int32Array(size);
    let best = 0;
    for (let s = 0; s < size; s++) {
      if (el[s] !== El.WATER || seen[s]) continue;
      let n = 0;
      let open = false;
      let top = 0;
      const visit = (j: number) => {
        if (!seen[j] && el[j] === El.WATER) {
          seen[j] = 1;
          stack[top++] = j;
        }
      };
      visit(s);
      while (top > 0) {
        const i = stack[--top];
        n++;
        const x = i % w;
        const y = (i / w) | 0;
        if (y > 0 && !open) open = (sky ??= skyReach(world))[i - w] === 1;
        if (x > 0) visit(i - 1);
        if (x < w - 1) visit(i + 1);
        if (y > 0) visit(i - w);
        if (y < h - 1) visit(i + w);
      }
      if (open) best = Math.max(best, n);
    }
    return best;
  },
  'Largest pond',
);
