import { ArtFrame } from '../artFrame';
import { registerLayer } from '../render';

let off: HTMLCanvasElement | null = null;
let offG: CanvasRenderingContext2D | null = null;
let image: ImageData | null = null;
let px: Uint32Array | null = null;
const frame = new ArtFrame();

/**
 * The ink layer (still named `art`): everything drawn at art resolution, in one buffer. First the
 * generator's art for the cells that still match the blueprint (see compose()), then the shaders for
 * the sim cells that do not (water, fire, loose pieces...). Pages without art (the sandbox) get just
 * the shaders. The buffer persists: only the tiles that changed are redrawn and uploaded (ArtFrame).
 */
registerLayer({
  name: 'art',
  order: 20,
  kind: 'canvas',
  flag: 'artLayer',
  draw: ({ g, world, art, frontierX, scale, shaded }) => {
    if (!art && !shaded) return;
    const k = art ? art.art.k : scale;
    const aw = world.w * k;
    const ah = world.h * k;
    if (!off || off.width !== aw || off.height !== ah) {
      off = document.createElement('canvas');
      off.width = aw;
      off.height = ah;
      offG = off.getContext('2d');
      if (!offG) return;
      image = offG.createImageData(aw, ah);
      px = new Uint32Array(image.data.buffer);
    }
    if (!offG || !image || !px) return;
    const rects = frame.update(px, world, art, frontierX ?? world.w, k, shaded && k === scale);
    for (let r = 0; r < frame.rectCount; r++) {
      const { x, y, w, h } = rects[r];
      offG.putImageData(image, 0, 0, x, y, w, h);
    }
    g.drawImage(off, 0, 0, world.w, world.h);
  },
});
