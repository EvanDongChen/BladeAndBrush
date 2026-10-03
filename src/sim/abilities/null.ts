import { registerAbility, type AbilityArgs, type PointerSample } from '../../core/abilities';
import { El } from '../../core/elements';
import type { World } from '../../core/world';
import { markUnsupported } from '../behaviors/rigid';
import { forCapsule } from '../brush';

/** Quietly erase everything under the brush: smooth edge, no splatter, no CUT flag. */
function erase(world: World, a: PointerSample, b: PointerSample, args: AbilityArgs): void {
  forCapsule(world, a.x, a.y, b.x, b.y, Math.max(1, args.radius ?? 4), (x, y) => world.set(x, y, El.EMPTY));
  markUnsupported(world);
}

registerAbility({
  id: 'null',
  name: 'Null',
  icon: '無',
  begin: (world, s, args) => erase(world, s, s, args),
  move: (world, from, to, args) => erase(world, from, to, args),
  end: () => {},
});
