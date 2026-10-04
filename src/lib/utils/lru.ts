/** Small LRU with per-entry TTL (Map keeps insertion order; re-insert on hit to mark recent). */
export class TtlLru<K, V> {
  private map = new Map<K, { value: V; exp: number }>();
  constructor(
    private max: number,
    private ttlMs: number,
    private now: () => number = Date.now,
  ) {}

  get(key: K): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.exp <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: K, value: V) {
    this.map.delete(key);
    this.map.set(key, { value, exp: this.now() + this.ttlMs });
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as K);
  }

  delete(key: K) {
    this.map.delete(key);
  }

  get size() {
    return this.map.size;
  }
}
