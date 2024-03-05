export class WeakRefMap<K, V extends object | string | null> {
  private readonly cacheMap = new Map<
    K,
    WeakRef<NonNullable<V>> | null | string
  >();
  private readonly finalizer = new FinalizationRegistry((key: K) => {
    // this.cacheMap.delete(key);
    console.log("deleting key", key);
  });

  add(key: K, value: V): V {
    const cache = this.get(key);
    if (cache) {
      if (cache === value) return value;
      if (typeof cache === "object") {
        this.finalizer.unregister(cache);
      }
    }
    this.cacheMap.set(
      key,
      typeof value === "object" && value !== null ? new WeakRef(value) : value,
    );
    if (typeof value === "object" && value !== null) {
      this.finalizer.register(value, key, value);
    }

    return value;
  }

  get(key: K): V | null {
    const cache = this.cacheMap.get(key);
    if (typeof cache === "string" || cache === null) {
      return cache as V;
    } else {
      const val = cache?.deref() ?? null;
      return val;
    }
  }
}

export const innerCache = Symbol("Inner cache");

export function cached<K extends unknown[], V extends {} | null>(
  getter: (...keys: K) => V,
) {
  const cache = new WeakMap<K, V>();
  const fn: { (...keys: K): V; [innerCache]: WeakMap<K, V> } = (...keys: K) => {
    if (cache.has(keys)) {
      console.log("found key");
      return cache.get(keys)!;
    } else {
      const value = getter(...keys);
      // console.log("computed value");
      cache.set(keys, value);
      // console.log("set keys");
      return value;
    }
  };
  fn[innerCache] = cache;
  return fn;
}
