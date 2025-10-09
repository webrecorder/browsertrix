import type { ReactiveController, ReactiveControllerHost } from "lit";

type Update = {
  update: (prev: URLSearchParams) => URLSearchParams;
  prevParams: URLSearchParams;
  type: "push" | "replace";
  source?: string;
  pending?: PromiseLike<unknown>;
  data?: unknown;
};

export class SearchParamsController implements ReactiveController {
  static #pendingUpdates: Update[] = [];
  static #transaction = false;
  static set transaction(value: boolean) {
    if (value) {
      SearchParamsController.#transaction = value;
      return;
    }
    if (SearchParamsController.#transaction) {
      console.debug(
        "SearchParamsController: transaction not closed; pending updates:",
        SearchParamsController.#pendingUpdates,
      );
    }
  }
  static get transaction(): boolean {
    return SearchParamsController.#transaction;
  }
  static #timeout: number | undefined;
  static pushUpdate(update: Update) {
    console.debug("pushed update", update);
    SearchParamsController.#pendingUpdates.push(update);
    if (SearchParamsController.#timeout) {
      window.clearTimeout(SearchParamsController.#timeout);
    }
    SearchParamsController.#timeout = window.setTimeout(async () => {
      console.debug("running updates", SearchParamsController.#pendingUpdates);
      SearchParamsController.transaction = true;
      let newParams = new URLSearchParams(location.search);
      await Promise.all(
        SearchParamsController.#pendingUpdates.map(async (update, index) => {
          console.debug(`new params before update ${index}`, newParams);
          newParams = update.update(newParams);
          console.debug(`new params after update ${index}`, newParams);
          if (update.pending) {
            await update.pending;
          }
        }),
      );
      const url = new URL(location.toString());
      url.search = newParams.toString();
      if (update.type === "push") {
        history.pushState(update.data, "", url);
      } else {
        history.replaceState(update.data, "", url);
      }
      SearchParamsController.#pendingUpdates = [];
      SearchParamsController.#transaction = false;
    }, 0);
  }

  private readonly host: ReactiveControllerHost;
  private readonly changeHandler?: (
    searchParams: URLSearchParams,
    prevParams: URLSearchParams,
  ) => void;
  private prevParams = new URLSearchParams(location.search);

  public get searchParams() {
    return new URLSearchParams(location.search);
  }

  public update(
    update: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
    options: { replace?: boolean; data?: unknown; transaction?: boolean } = {
      replace: false,
    },
  ) {
    SearchParamsController.transaction = !!options.transaction;
    this.prevParams = new URLSearchParams(this.searchParams);
    if (SearchParamsController.transaction) {
      SearchParamsController.pushUpdate({
        prevParams: this.prevParams,
        update: (params) => {
          if (typeof update === "function") {
            return update(params);
          }
          return update;
        },
        source: "update",
        type: options.replace ? "replace" : "push",
        pending: this.host.updateComplete,
        data: options.data,
      });
      return;
    }
    const url = new URL(location.toString());
    url.search =
      typeof update === "function"
        ? update(this.searchParams).toString()
        : update.toString();

    if (url.toString() === location.toString()) return;

    if (options.replace) {
      history.replaceState(options.data, "", url);
    } else {
      history.pushState(options.data, "", url);
    }
  }

  public set(
    name: string,
    value: string,
    options: { replace?: boolean; data?: unknown; transaction?: boolean } = {
      replace: false,
    },
  ) {
    SearchParamsController.transaction = !!options.transaction;
    this.prevParams = new URLSearchParams(this.searchParams);
    if (SearchParamsController.transaction) {
      SearchParamsController.pushUpdate({
        prevParams: this.prevParams,
        update: (params) => {
          params.set(name, value);
          return params;
        },
        type: options.replace ? "replace" : "push",
        source: "set",
        pending: this.host.updateComplete,
        data: options.data,
      });
      return;
    }
    const url = new URL(location.toString());
    const newParams = new URLSearchParams(this.searchParams);
    newParams.set(name, value);
    url.search = newParams.toString();

    if (url.toString() === location.toString()) return;

    if (options.replace) {
      history.replaceState(options.data, "", url);
    } else {
      history.pushState(options.data, "", url);
    }
  }

  public delete(
    name: string,
    value: string,
    options?: { replace?: boolean; data?: unknown; transaction?: boolean },
  ): void;
  public delete(
    name: string,
    options?: { replace?: boolean; data?: unknown; transaction?: boolean },
  ): void;
  public delete(
    name: string,
    valueOrOptions?: string | { replace?: boolean; data?: unknown },
    options?: { replace?: boolean; data?: unknown; transaction?: boolean },
  ) {
    SearchParamsController.transaction = !!options?.transaction;
    this.prevParams = new URLSearchParams(this.searchParams);
    if (SearchParamsController.transaction) {
      SearchParamsController.pushUpdate({
        prevParams: this.prevParams,
        update: (params) => {
          if (typeof valueOrOptions === "string") {
            params.delete(name, valueOrOptions);
          } else {
            params.delete(name);
            options = valueOrOptions;
          }
          return params;
        },
        type: options?.replace ? "replace" : "push",
        source: "delete",
        pending: this.host.updateComplete,
        data: options?.data,
      });
      return;
    }
    const url = new URL(location.toString());
    const newParams = new URLSearchParams(this.searchParams);
    if (typeof valueOrOptions === "string") {
      newParams.delete(name, valueOrOptions);
    } else {
      newParams.delete(name);
      options = valueOrOptions;
    }
    options ??= { replace: false };
    url.search = newParams.toString();

    if (url.toString() === location.toString()) return;

    if (options.replace) {
      history.replaceState(options.data, "", url);
    } else {
      history.pushState(options.data, "", url);
    }
  }

  constructor(
    host: ReactiveControllerHost,
    onChange?: (
      searchParams: URLSearchParams,
      prevParams: URLSearchParams,
    ) => void,
  ) {
    this.host = host;
    host.addController(this);
    this.changeHandler = onChange;
  }

  hostConnected(): void {
    window.addEventListener("popstate", this.onPopState);
  }

  hostDisconnected(): void {
    window.removeEventListener("popstate", this.onPopState);
  }

  private readonly onPopState = (_e: PopStateEvent) => {
    this.changeHandler?.(this.searchParams, this.prevParams);
    this.prevParams = new URLSearchParams(this.searchParams);
  };
}
