import { abilities, type Ability, type AbilityArgs, type AbilityId, type PointerSample } from './abilities';
import { flagOn } from './config';
import type { World } from './world';

/** A pointer sample stamped with the tick it was applied on. */
export interface TimedSample extends PointerSample {
  t: number;
}

/** One ability use: pointer down (tick) through pointer up (endTick). */
export interface ActionRecord {
  tick: number;
  ability: AbilityId;
  args: AbilityArgs;
  path: TimedSample[];
  endTick?: number;
}

export type ActionLog = ActionRecord[];

type InputEvent =
  | { kind: 'begin'; ability: AbilityId; args: AbilityArgs; s: PointerSample }
  | { kind: 'move'; s: PointerSample }
  | { kind: 'end' };

/**
 * Feeds ability input into the world at tick boundaries, and records it.
 *
 * Live: the page calls begin/move/end whenever pointer events arrive; they are queued and applied
 * at the start of the next tick, stamped with that tick.
 * Replay: construct with a log; apply() re-feeds each event at the tick it was recorded on.
 * Both paths share dispatch(), so the same seed, params and log give the same world.hash().
 *
 * Call apply(world) once per tick, before the sim step.
 */
export class ActionDriver {
  readonly log: ActionLog = [];
  private queue: InputEvent[] = [];
  private active: { ability: Ability; record: ActionRecord; last: PointerSample } | null = null;
  private readonly script: Map<number, InputEvent[]> | null = null;

  constructor(replay?: ActionLog) {
    if (!replay) return;
    this.script = new Map();
    const at = (tick: number, e: InputEvent) => {
      const list = this.script!.get(tick);
      if (list) list.push(e);
      else this.script!.set(tick, [e]);
    };
    for (const rec of replay) {
      const [first, ...rest] = rec.path;
      at(rec.tick, { kind: 'begin', ability: rec.ability, args: rec.args, s: first });
      for (const s of rest) at(s.t, { kind: 'move', s });
      if (rec.endTick !== undefined) at(rec.endTick, { kind: 'end' });
    }
  }

  get replaying(): boolean {
    return this.script !== null;
  }

  /** Number of ability uses so far (what an action budget counts). */
  get uses(): number {
    return this.log.length;
  }

  get activeAbility(): AbilityId | null {
    return this.active?.ability.id ?? null;
  }

  begin(ability: AbilityId, s: PointerSample, args: AbilityArgs = {}): void {
    if (!this.script) this.queue.push({ kind: 'begin', ability, args: { ...args }, s: { ...s } });
  }

  move(s: PointerSample): void {
    if (!this.script) this.queue.push({ kind: 'move', s: { ...s } });
  }

  end(): void {
    if (!this.script) this.queue.push({ kind: 'end' });
  }

  apply(world: World): void {
    const events = this.script ? this.script.get(world.tick) : this.queue.splice(0);
    if (events) for (const e of events) this.dispatch(world, e);
    const a = this.active;
    a?.ability.tick?.(world, a.record.args);
  }

  private dispatch(world: World, e: InputEvent): void {
    const t = world.tick;
    if (e.kind === 'begin') {
      if (this.active) this.dispatch(world, { kind: 'end' });
      const ability = abilities.get(e.ability);
      if (!ability || !flagOn(ability.flag)) return;
      const s = { x: e.s.x, y: e.s.y, speed: e.s.speed, t };
      const record: ActionRecord = { tick: t, ability: e.ability, args: e.args, path: [s] };
      this.log.push(record);
      this.active = { ability, record, last: s };
      ability.begin(world, s, e.args);
    } else if (e.kind === 'move') {
      const a = this.active;
      if (!a) return;
      const s = { x: e.s.x, y: e.s.y, speed: e.s.speed, t };
      a.record.path.push(s);
      a.ability.move(world, a.last, s, a.record.args);
      a.last = s;
    } else {
      const a = this.active;
      if (!a) return;
      a.record.endTick = t;
      this.active = null;
      a.ability.end(world, a.record.args);
    }
  }
}
