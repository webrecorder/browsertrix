import { type Cache } from "./weakCache";

export function timeoutCache(seconds: number) {
  return class<K, V> implements Cache<K, V> {
    private readonly cache: { [key: string]: V } = Object.create(null);
    set(key: K | string, value: V) {
      if (typeof key !== "string") {
        key = JSON.stringify(key);
      }
      this.cache[key] = value;
      setTimeout(() => {
        try {
          delete this.cache[key];
        } catch (_) {
          /* empty */
          console.debug("missing key", key);
        }
      }, seconds * 1000);
      return this;
    }
    get(key: K | string) {
      if (typeof key !== "string") {
        key = JSON.stringify(key);
      }
      try {
        return this.cache[key];
      } catch (_) {
        console.debug("missing key", key);
        /* empty */
      }
    }
    has(key: K | string) {
      if (typeof key !== "string") {
        key = JSON.stringify(key);
      }
      return Object.prototype.hasOwnProperty.call(this.cache, key);
    }
  };
}
