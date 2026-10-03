import { compose, prepareArt } from '../artCompose';
import { registerLayer } from '../render';

let off: HTMLCanvasElement | null = null;
let offG: CanvasRenderingContext2D | null = null;
let image: ImageData | null = null;
let px: Uint32Array | null = null;

/**
 * Hybrid art layer (section 3.8): every visible art pixel belongs to a cell that still matches
 * the blueprint (see compose()). Built at k x resolution offscreen, drawn once per frame.
 */
registerLayer({
  name: 'art',
  order: 20,
  kind: 'canvas',
  flag: 'artLayer',
  draw: ({ g, world, art, frontierX }) => {
    if (!art) return;
    const aw = world.w * art.art.k;
    const ah = world.h * art.art.k;
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
    compose(px, world.el, art.el, world.w, world.h, prepareArt(art.art), frontierX ?? world.w);
    offG.putImageData(image, 0, 0);
    g.drawImage(off, 0, 0, world.w, world.h);
  },
});
