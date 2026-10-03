import { registerLayer } from '../render';

/** Bright "brush head" at the frontier column while the painting reveals itself. */
registerLayer({
  name: 'frontier',
  order: 30,
  kind: 'canvas',
  draw: ({ g, world, frontierX }) => {
    if (frontierX === undefined || frontierX >= world.w) return;
    g.fillStyle = 'rgba(178, 34, 34, 0.18)';
    g.fillRect(frontierX - 6, 0, 6, world.h);
    g.fillStyle = 'rgba(178, 34, 34, 0.85)';
    g.fillRect(frontierX, 0, 1, world.h);
  },
});
