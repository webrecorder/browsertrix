import type { ReactiveController, ReactiveControllerHost } from "lit";

export class SearchParamsController implements ReactiveController {
  private readonly host: ReactiveControllerHost;
  private readonly changeHandler?: (
    searchParams: URLSearchParams,
    prevParams: URLSearchParams,
  ) => void;
  private prevParams = new URLSearchParams(location.search);

  public get searchParams() {
    return new URLSearchParams(location.search);
  }

  public set(
    update: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
    options: { replace?: boolean; data?: unknown } = { replace: false },
  ) {
    this.prevParams = new URLSearchParams(this.searchParams);
    const url = new URL(location.toString());
    url.search =
      typeof update === "function"
        ? update(this.searchParams).toString()
        : update.toString();

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
