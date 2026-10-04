import { compose, prepareArt } from '../artCompose';
import { registerLayer } from '../render';
import { shadeCells } from '../shadeCells';

let off: HTMLCanvasElement | null = null;
let offG: CanvasRenderingContext2D | null = null;
let image: ImageData | null = null;
let px: Uint32Array | null = null;

/**
 * The ink layer (still named `art`): everything drawn at art resolution, in one buffer and one
 * upload. First the generator's art for the cells that still match the blueprint (see compose()),
 * then the shaders for the sim cells that do not (water, fire, loose pieces...). Pages without art
 * (the sandbox) get just the shaders.
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
    if (art) compose(px, world.el, world.plane, prepareArt(art), frontierX ?? world.w);
    else px.fill(0);
    if (shaded && k === scale) shadeCells(px, world, k, art, frontierX ?? world.w);
    offG.putImageData(image, 0, 0);
    g.drawImage(off, 0, 0, world.w, world.h);
  },
});
