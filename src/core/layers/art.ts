import { registerLayer } from '../render';

/**
 * Hybrid art layer hook (section 3.8). Draws the blueprint's pre-rendered art, clipped to the
 * frontier. Phase 0 blueprints have no art, so this draws nothing yet.
 * TODO(A): mask by cell occupancy (erase art where solid cells became EMPTY) and draw it below
 * the dynamic elements.
 */
registerLayer({
  name: 'art',
  order: 20,
  kind: 'canvas',
  flag: 'artLayer',
  draw: ({ g, world, art, frontierX }) => {
    if (!art) return;
    const clipW = Math.min(world.w, frontierX ?? world.w);
    g.save();
    g.beginPath();
    g.rect(0, 0, clipW, world.h);
    g.clip();
    g.drawImage(art.canvas, 0, 0, world.w, world.h);
    g.restore();
  },
});
