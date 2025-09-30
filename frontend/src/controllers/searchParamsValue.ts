import { type ReactiveController, type ReactiveControllerHost } from "lit";

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
 * There is currently one option available via a third parameter, `initial`,
 * which can be used to modify the initial value based on the URL search params
 * at the time of initialization. This is useful if there's a default value that
 * should be used if the URL search params are empty, but otherwise the value
 * from the URL should be prioritized, for example.
 *
 * Example usage:
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
 *     return html`<input .value=${this.query.value} @input=${(e) => {this.query.setValue(e.target.value)}} />`;
 *   }
 * }
 * ```
 */
export class SearchParamsValue<T> implements ReactiveController {
  host: ReactiveControllerHost;

  private _value: T;

  private readonly searchParams;
  private readonly encoder: (
    value: T,
    params: URLSearchParams,
  ) => URLSearchParams;
  private readonly decoder: (params: URLSearchParams) => T;

  public get value(): T {
    return this._value;
  }
  public setValue(value: T) {
    this._value = value;
    this.searchParams.update((params) => this.encoder(value, params));
    this.host.requestUpdate();
  }

  constructor(
    host: ReactiveControllerHost,
    encoder: (value: T, params: URLSearchParams) => URLSearchParams,
    decoder: (params: URLSearchParams) => T,
    options?: { initial?: (valueFromSearchParams?: T) => T },
  ) {
    (this.host = host).addController(this);
    this.encoder = encoder;
    this.decoder = decoder;
    this.searchParams = new SearchParamsController(this.host, (params) => {
      this._value = this.decoder(params);
      this.host.requestUpdate();
    });

    this._value = options?.initial
      ? options.initial(this.decoder(this.searchParams.searchParams))
      : this.decoder(this.searchParams.searchParams);
  }

  hostConnected() {}
  hostDisconnected() {}
}
