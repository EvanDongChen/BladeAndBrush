import type { ScanResult } from './scan';

/**
 * Typed events. The sim only emits; audio, screen shake, particles and scoring subscribe.
 * Add new event types by declaration merging from your own module:
 *   declare module '../core/events' { interface GameEvents { myEvent: { x: number } } }
 * Listeners must never mutate the World (that would break replay determinism).
 */
export interface GameEvents {
  cut: { x: number; y: number; el: number; owner: number };
  ignite: { x: number; y: number };
  burn: { x: number; y: number; el: number };
  splash: { x: number; y: number };
  levelStart: { levelId: string };
  frontierAdvance: { x: number };
  scanComplete: { result: ScanResult };
  levelWin: { levelId: string };
  levelFail: { levelId: string };
}

export type EventType = keyof GameEvents;
type Handler<K extends EventType> = (payload: GameEvents[K]) => void;

export class EventBus {
  private readonly handlers = new Map<EventType, Set<Handler<never>>>();

  /** Subscribe. Returns an unsubscribe function. */
  on<K extends EventType>(type: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set.delete(fn as Handler<never>);
  }

  /** True if anyone listens. Hot code checks this before building a payload object. */
  has(type: EventType): boolean {
    const set = this.handlers.get(type);
    return set !== undefined && set.size > 0;
  }

  emit<K extends EventType>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) (fn as Handler<K>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
