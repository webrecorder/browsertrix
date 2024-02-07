import type { DebouncedFunc } from "lodash";

/**
 * Gets the underlying function type of a debounced function.
 * Useful because lit-plugin doesn't recognize debounced function types as callable
 *
 * @example
 * <sl-input ‍‍@sl-input={this.onInput as UnderlyingFunction<typeof this.onInput>} >
 */
export type UnderlyingFunction<T> = T extends DebouncedFunc<infer F> ? F : T;
