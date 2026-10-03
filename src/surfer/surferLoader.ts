/**
 * Loads by key, once each. `get` is polled every frame: it returns the value once that key has loaded, null while it
 * loads, and null for good after a failure (reported once to onError, never retried). A slow earlier key can't show
 * in place of a newer one, because the caller asks by the key it wants now.
 */
export class KeyedLoader<K, T> {
  private readonly done = new Map<K, T>();
  private readonly loading = new Set<K>();
  private readonly failed = new Set<K>();

  constructor(private readonly load: (key: K) => Promise<T>, private readonly onError: (key: K, e: unknown) => void) {}

  get(key: K): T | null {
    const hit = this.done.get(key);
    if (hit !== undefined) return hit;
    if (this.loading.has(key) || this.failed.has(key)) return null;
    this.loading.add(key);
    this.load(key).then(
      (v) => { this.done.set(key, v); this.loading.delete(key); },
      (e) => { this.failed.add(key); this.loading.delete(key); this.onError(key, e); },
    );
    return null;
  }

  /** Whether `key` has finished: loaded, or failed for good. False before it's asked for and while it loads. */
  settled(key: K): boolean {
    return this.done.has(key) || this.failed.has(key);
  }
}
