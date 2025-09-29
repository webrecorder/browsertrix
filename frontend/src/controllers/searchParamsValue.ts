import { type ReactiveController, type ReactiveControllerHost } from "lit";

import { SearchParamsController } from "@/controllers/searchParams";

export class SearchParamsValue<T> implements ReactiveController {
  host: ReactiveControllerHost;

  private _value: T;

  private readonly searchParams;
  private readonly encoder: (
    value: T,
    params: URLSearchParams,
  ) => URLSearchParams;
  private readonly decoder: (params: URLSearchParams) => T;

  get value(): T {
    return this._value;
  }
  set value(value: T) {
    this._value = value;
    this.searchParams.update((params) => this.encoder(value, params));
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
