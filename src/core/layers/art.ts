import { ArtFrame } from '../artFrame';
import { resampleArt } from '../artResample';
import { flagOn } from '../config';
import { GpuArt } from '../gpuArt';
import { registerLayer } from '../render';

interface CpuSurface {
  off: HTMLCanvasElement;
  offG: CanvasRenderingContext2D;
  image: ImageData;
  px: Uint32Array;
  frame: ArtFrame;
}
interface Surface {
  /** The GPU path (null until tried; .ok false = unavailable, so the CPU path draws). */
  gpu: GpuArt | null;
  gpuFrame: ArtFrame;
  /** The CPU path's buffer, made the first time it is needed. */
  cpu: CpuSurface | null;
}
/** Per destination canvas (a page can have more than one renderer): its buffers and frame state. */
const surfaces = new WeakMap<CanvasRenderingContext2D, Surface>();

/**
 * The ink layer (still named `art`): everything drawn at art resolution. First the generator's art
 * for the cells that still match the blueprint (see compose()), then the shaders for the sim cells
 * that do not (water, fire, loose pieces...). Pages without art (the sandbox) get just the shaders.
 * Only the tiles that changed are redrawn (ArtFrame). With WebGL2 the pixels are drawn on the GPU
 * from per-cell records (core/gpuArt.ts); otherwise on the CPU into a persistent buffer.
 */
registerLayer({
  name: 'art',
  order: 20,
  kind: 'canvas',
  flag: 'artLayer',
  draw: ({ g, world, art: generated, frontierX, scale, shaded }) => {
    if (!generated && !shaded) return;
    // a canvas smaller than the art (pages pick their scale from the screen): use the art resampled to it
    const art = generated && generated.art.k > scale ? resampleArt(generated, scale) : generated;
    const k = art ? art.art.k : scale;
    const fx = frontierX ?? world.w;
    const shade = shaded && k === scale;
    let sf = surfaces.get(g);
    if (!sf) surfaces.set(g, (sf = { gpu: null, gpuFrame: new ArtFrame(), cpu: null }));

    if (flagOn('gpuArt')) {
      sf.gpu ??= new GpuArt();
      const gpu = sf.gpu;
      if (gpu.ok) gpu.prepare(art, world.w, world.h, k);
      if (gpu.ok && gpu.target) {
        const cells = sf.gpuFrame.updateCells(gpu.target, world, art, fx, k, shade);
        gpu.upload(cells, sf.gpuFrame.rectCount);
        gpu.draw(world.tick, shade);
        g.drawImage(gpu.canvas, 0, 0, world.w, world.h);
        return;
      }
    }

    const aw = world.w * k;
    const ah = world.h * k;
    let cpu = sf.cpu;
    if (!cpu || cpu.off.width !== aw || cpu.off.height !== ah) {
      const off = document.createElement('canvas');
      off.width = aw;
      off.height = ah;
      const offG = off.getContext('2d');
      if (!offG) return;
      const image = offG.createImageData(aw, ah);
      sf.cpu = cpu = { off, offG, image, px: new Uint32Array(image.data.buffer), frame: new ArtFrame() };
    }
    const { off, offG, image, px, frame } = cpu;
    const rects = frame.update(px, world, art, fx, k, shade);
    for (let r = 0; r < frame.rectCount; r++) {
      const { x, y, w, h } = rects[r];
      offG.putImageData(image, 0, 0, x, y, w, h);
    }
    g.drawImage(off, 0, 0, world.w, world.h);
  },
});
