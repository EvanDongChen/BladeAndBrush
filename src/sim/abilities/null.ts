import { El } from '../../core/elements';
import { markUnsupported } from '../behaviors/rigid';
import { forCapsule } from '../brush';
import { registerLineAbility } from '../lineAbility';
import { isProtected } from '../protect';

/** Aim a line, release to quietly erase the strip: smooth edge, no splatter, no CUT flag. */
registerLineAbility({
  id: 'null',
  name: 'Null',
  icon: '無',
  color: '90, 90, 110',
  apply: (world, ax, ay, bx, by, r) => {
    forCapsule(world, ax, ay, bx, by, r, (x, y) => {
      if (!isProtected(world, y * world.w + x)) world.set(x, y, El.EMPTY);
    });
    markUnsupported(world);
  },
});
