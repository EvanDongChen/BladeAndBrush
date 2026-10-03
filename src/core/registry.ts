/**
 * Generic keyed registry used by every extension point (elements, behaviors, abilities, features,
 * metrics, goals, layers, levels, params). Registering a duplicate key throws, so collisions show
 * up at startup instead of at integration.
 */
export class ExtensionRegistry<T> {
  private readonly items = new Map<string | number, T>();
  /** Bumped on every change, so callers can cache sorted views. */
  version = 0;

  constructor(
    readonly kind: string,
    private readonly keyOf: (item: T) => string | number,
    readonly labelOf: (item: T) => string = (item) => String(keyOf(item)),
  ) {
    ALL_REGISTRIES.push(this as ExtensionRegistry<unknown>);
  }

  register(item: T): T {
    const key = this.keyOf(item);
    if (this.items.has(key)) throw new Error(`Duplicate ${this.kind} "${key}"`);
    this.items.set(key, item);
    this.version++;
    return item;
  }

  unregister(key: string | number): void {
    if (this.items.delete(key)) this.version++;
  }

  get(key: string | number): T | undefined {
    return this.items.get(key);
  }

  has(key: string | number): boolean {
    return this.items.has(key);
  }

  /** Entries in registration order. */
  all(): T[] {
    return [...this.items.values()];
  }

  get size(): number {
    return this.items.size;
  }
}

/** Every registry ever created, for the registry inspector on the test pages. */
export const ALL_REGISTRIES: ExtensionRegistry<unknown>[] = [];

/** Sort helper for registries whose entries carry an `order`. */
export const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;
