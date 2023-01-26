import UrlPattern from "url-pattern";

type Routes = { [key: string]: UrlPattern };
type Paths = { [key: string]: string };

export type ViewState = {
  // route name, e.g. "home"
  route: string | null;
  // path name
  // e.g. "/dashboard"
  // e.g. "/users/abc123"
  pathname: string;
  // params from URL (:) or query (?)
  // e.g. "/users/:id"
  // e.g. "/redirect?url"
  params: { [key: string]: string };
  // arbitrary data to pass between routes
  data?: { [key: string]: any };
};

export default class APIRouter {
  private routes: Routes;

  constructor(paths: Paths) {
    this.routes = {};

    for (const [name, route] of Object.entries(paths)) {
      this.routes[name] = new UrlPattern(route);
    }
  }

  match(url: string): ViewState {
    for (const [name, pattern] of Object.entries(this.routes)) {
      const [path, qs] = url.split("?");
      const urlParams = pattern.match(path);

      if (urlParams) {
        const params = {
          ...urlParams,
          ...Object.fromEntries(new URLSearchParams(qs).entries()),
        };
        return { route: name, pathname: url, params };
      }
    }

    return { route: null, pathname: url, params: {} };
  }
}
