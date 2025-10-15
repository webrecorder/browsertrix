import { type ReactiveController, type ReactiveElement } from "lit";
import isEqual from "lodash/isEqual";

import { SearchParamsController } from "@/controllers/searchParams";

/**
 * Persists arbitrary state to the URL search params via an encoder and decoder.
 *
 * Automatically updates the URL search params when the value changes, and
 * updates the host when the URL search params change. Updates to the value push
 * state to the history stack, and so browser history navigation can be used to
 * navigate between states.
 *
 * ## Usage
 *
 * As a reactive controller, the class must be passed a host as the first
 * argument. The second argument is the encoder, which receives the current
 * (incoming) value and the current URLSearchParams object, and returns a
 * modified URLSearchParams object that represents the new value. The third
 * argument is the decoder, which receives the current URLSearchParams object
 * and converts this into a valid value.
 *
 * To access the value, use the `value` property. Setting the value with
 * `setValue` will update the URL search params and push state to the history
 * stack, and reading it is cached, so performance should be good no matter what.
 *
 * Updates to the value via `setValue` will request an update from the host
 * with the name set to the property name of the controller on the host followed
 * by `.setValue`. This allows you to use lifecycle hooks such as `willUpdate`
 * you would with any other state or property.
 *
 * Similarly, updates to the value originating from the browser (e.g. user
 * navigation, URL changes, etc.) will also trigger updates to the value, but
 * suffixed with `.value`. This allows you to use lifecycle hooks to react to
 * changes originating in different places differently.
 *
 * ## Options
 *
 * ### `initial`
 * `options.initial` can be used to modify the initial value based on the URL
 * search params at the time of initialization. This is useful if there's a
 * default value that should be used if the URL search params are empty, but
 * otherwise the value from the URL should be prioritized, for example.
 *
 * ### `propertyName`
 * `options.propertyName` can be used to specify the name of the property in the
 * host so that this controller can correctly request updates in the host. This
 * shouldn't need to be set if the controller is initialized in the host class
 * body, but if it's initialized in the host class constructor, it should be set
 * to the name of the property that holds the controller instance.
 *
 * ## Example usage
 * ```ts
 * class MyComponent extends LitElement {
 *   query = new SearchParamsValue<string>(
 *     this,
 *     (value, params) => {
 *       if (value) {
 *         params.set("q", value);
 *       } else {
 *         params.delete("q");
 *       }
 *       return params;
 *     },
 *     (params) => params.get("q") ?? ""
 *   );
 *   render() {
 *     return html`<input
 *       .value=${this.query.value}
 *       @input=${(e) => {this.query.setValue(e.target.value)}}
 *     />`;
 *   }
 * }
 * ```
 */
export class SearchParamsValue<T> implements ReactiveController {
  readonly #host: ReactiveElement;

  #value: T;

  readonly #searchParams;
  readonly #encoder: (value: T, params: URLSearchParams) => URLSearchParams;
  readonly #decoder: (params: URLSearchParams) => T;

  readonly #options: {
    initial?: (valueFromSearchParams?: T) => T;
    propertyKey?: PropertyKey;
  };

  public get value(): T {
    return this.#value;
  }
  /**
   * Set value and request update if deep comparison with current value is not equal.
   */
  public setValue(value: T) {
    if (isEqual(value, this.#value)) return;

    const oldValue = this.#value;
    this.#value = value;
    this.#searchParams.update((params) => this.#encoder(value, params));
    this.#host.requestUpdate(this.#getPropertyName("setValue"), oldValue);
  }
  // Little bit hacky/metaprogramming-y, but this lets us auto-detect property
  // name from the host element's properties without needing to repeat the name
  // in a string passed into options in order to have `requestUpdate` be called
  // with the correct property name. Ideally, eventually we'd use a decorator,
  // which would allow us to avoid this hacky approach — though that might make
  // differentiating between internally-triggered ("setValue") and
  // externally-triggered ("value") updates a bit more complex.
  #getPropertyName(type: "value" | "setValue"): PropertyKey | undefined {
    // Use explicit property name if provided
    if (this.#options.propertyKey)
      return `${this.#options.propertyKey.toString()}.${type}`;

    try {
      for (const prop of Reflect.ownKeys(this.#host)) {
        const descriptor = Object.getOwnPropertyDescriptor(this.#host, prop);
        if (descriptor && descriptor.value === this) {
          this.#options.propertyKey = prop;
          return `${prop.toString()}.${type}`;
        }
      }
    } catch (error) {
      console.debug(
        "SearchParamsValue: Failed to auto-detect property name",
        error,
      );
    }
    return undefined;
  }

  constructor(
    host: ReactiveElement,
    encoder: (value: T, params: URLSearchParams) => URLSearchParams,
    decoder: (params: URLSearchParams) => T,
    options?: {
      initial?: (valueFromSearchParams?: T) => T;
      propertyKey?: PropertyKey;
    },
  ) {
    (this.#host = host).addController(this);
    this.#encoder = encoder;
    this.#decoder = decoder;
    this.#options = options || {};
    this.#searchParams = new SearchParamsController(this.#host, (params) => {
      const oldValue = this.#value;
      this.#value = this.#decoder(params);

      if (isEqual(oldValue, this.#value)) return;

      this.#host.requestUpdate(this.#getPropertyName("value"), oldValue);
    });

    this.#value = options?.initial
      ? options.initial(this.#decoder(this.#searchParams.searchParams))
      : this.#decoder(this.#searchParams.searchParams);
  }

  hostConnected() {}
  hostDisconnected() {}
}
