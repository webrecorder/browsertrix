import type { ReactiveController, ReactiveControllerHost } from "lit";

export class SearchParamsController implements ReactiveController {
  private _host!: ReactiveControllerHost;

  private set host(host: ReactiveControllerHost) {
    console.log("host set", host);
    this._host = host;
  }

  private get host() {
    console.log("host get", this._host);
    return this._host;
  }

  public searchParams = new URLSearchParams(location.search);

  public set(
    update: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
    options: { replace?: boolean; data?: unknown } = { replace: false },
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

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected(): void {
    window.addEventListener("popstate", this.onPopState);
  }

  hostDisconnected(): void {
    window.removeEventListener("popstate", this.onPopState);
  }

  private onPopState(_e: PopStateEvent) {
    this.searchParams = new URLSearchParams(location.search);
    this.host.requestUpdate();
  }
}
