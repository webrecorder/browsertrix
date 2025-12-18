/**
 * Persist shared state properties in browser storage
 */
import type {
  ReadonlyStateVar,
  StateOptions,
  StateVar,
} from "lit-shared-state";

export const STORAGE_KEY_PREFIX = "btrix.app";

type ExpiringValue = {
  value: unknown;
  expiry: number;
};

export const persist = (
  storage: Storage,
  ttlMinutes?: number,
): StateOptions => ({
  set(stateVar: StateVar, v: string | null | undefined) {
    if (v === null || v === undefined) {
      storage.removeItem(`${STORAGE_KEY_PREFIX}.${stateVar.key}`);
    } else {
      storage.setItem(
        `${STORAGE_KEY_PREFIX}.${stateVar.key}`,
        JSON.stringify(
          ttlMinutes
            ? ({
                value: v,
                expiry: Date.now() + ttlMinutes * 1000 * 60,
              } as ExpiringValue)
            : v,
        ),
      );
    }
    stateVar.value = v;
  },
  get(stateVar: ReadonlyStateVar) {
    const stored = storage.getItem(`${STORAGE_KEY_PREFIX}.${stateVar.key}`);
    if (stored) {
      const data = JSON.parse(stored) as unknown;

      if (
        data !== null &&
        typeof data === "object" &&
        Object.prototype.hasOwnProperty.call(data, "expiry") &&
        Object.prototype.hasOwnProperty.call(data, "value")
      ) {
        if (Date.now() > (data as ExpiringValue).expiry) {
          storage.removeItem(`${STORAGE_KEY_PREFIX}.${stateVar.key}`);
          return undefined;
        }
        return (data as ExpiringValue).value;
      }

      return data;
    }
    return undefined;
  },
  init(stateVar: ReadonlyStateVar, valueInit?: unknown) {
    return stateVar.options.get(stateVar) || valueInit;
  },
});
