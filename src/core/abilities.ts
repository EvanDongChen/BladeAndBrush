import { flagOn } from './config';
import { ExtensionRegistry } from './registry';
import type { World } from './world';

export type AbilityId = string;
/** Per-use arguments, recorded in the action log (e.g. brush radius, element to paint). */
export type AbilityArgs = Record<string, number>;

/** Sim units. `speed` is in cells per tick, computed at capture time and stored in the log. */
export interface PointerSample {
  x: number;
  y: number;
  speed: number;
}

export interface Ability {
  id: AbilityId;
  name: string;
  /** Short glyph for the ability bar. */
  icon?: string;
  /** Debug tools (e.g. the sandbox paint brush) are hidden from the game action bar. */
  debug?: boolean;
  /** Kill switch name in core/config.ts flags. */
  flag?: string;
  begin(world: World, s: PointerSample, args: AbilityArgs): void;
  /** Applies the effect along the segment. */
  move(world: World, from: PointerSample, to: PointerSample, args: AbilityArgs): void;
  end(world: World, args: AbilityArgs): void;
  /** Ongoing effect while the pointer is held (e.g. a water stream). */
  tick?(world: World, args: AbilityArgs): void;
  drawCursor?(g: CanvasRenderingContext2D): void;
}

export const abilities = new ExtensionRegistry<Ability>('ability', (a) => a.id, (a) => `${a.id} ${a.name}`);

export function registerAbility(a: Ability): Ability {
  return abilities.register(a);
}

/** Registered abilities that are not switched off, optionally including debug tools. */
export function activeAbilities(includeDebug: boolean): Ability[] {
  return abilities.all().filter((a) => flagOn(a.flag) && (includeDebug || !a.debug));
}
