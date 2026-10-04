import { ArtFrame } from '../artFrame';
import { resampleArt } from '../artResample';
import { registerLayer } from '../render';

interface Surface {
  off: HTMLCanvasElement;
  offG: CanvasRenderingContext2D;
  image: ImageData;
  px: Uint32Array;
  frame: ArtFrame;
}
/** Per destination canvas (a page can have more than one renderer): its buffer and its frame state. */
const surfaces = new WeakMap<CanvasRenderingContext2D, Surface>();

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
  draw: ({ g, world, art: generated, frontierX, scale, shaded }) => {
    if (!generated && !shaded) return;
    // a canvas smaller than the art (pages pick their scale from the screen): use the art resampled to it
    const art = generated && generated.art.k > scale ? resampleArt(generated, scale) : generated;
    const k = art ? art.art.k : scale;
    const aw = world.w * k;
    const ah = world.h * k;
    let sf = surfaces.get(g);
    if (!sf || sf.off.width !== aw || sf.off.height !== ah) {
      const off = document.createElement('canvas');
      off.width = aw;
      off.height = ah;
      const offG = off.getContext('2d');
      if (!offG) return;
      const image = offG.createImageData(aw, ah);
      sf = { off, offG, image, px: new Uint32Array(image.data.buffer), frame: new ArtFrame() };
      surfaces.set(g, sf);
    }
    const { off, offG, image, px, frame } = sf;
    const rects = frame.update(px, world, art, frontierX ?? world.w, k, shaded && k === scale);
    for (let r = 0; r < frame.rectCount; r++) {
      const { x, y, w, h } = rects[r];
      offG.putImageData(image, 0, 0, x, y, w, h);
    }
    g.drawImage(off, 0, 0, world.w, world.h);
  },
});
