import type { ReactiveController, ReactiveControllerHost } from "lit";

export class SearchParamsController implements ReactiveController {
  private readonly host: ReactiveControllerHost;
  private readonly changeHandler?: (searchParams: URLSearchParams) => void;

  public get searchParams() {
    return new URLSearchParams(location.search);
  }

  public set(
    update: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
    options: { replace?: boolean; data?: unknown } = { replace: true },
  ) {
    const url = new URL(location.toString());
    if (typeof update === "function") {
      const val = update(this.searchParams);
      console.log(val);
      url.search = val.toString();
    } else {
      url.search = update.toString();
    }
    if (options.replace) {
      history.replaceState(options.data, "", url);
    } else {
      history.pushState(options.data, "", url);
    }
  }

  constructor(
    host: ReactiveControllerHost,
    onChange?: (searchParams: URLSearchParams) => void,
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
    this.host.requestUpdate();
    this.changeHandler?.(this.searchParams);
  };
}
