import { Path } from "path-parser";

type Routes = { [key: string]: Path };
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
  routes: Routes;

  constructor(paths: Paths) {
    this.routes = {};

    for (const [name, route] of Object.entries(paths)) {
      this.routes[name] = new Path(route);
    }
  }

  match(path: string): ViewState {
    for (const [name, route] of Object.entries(this.routes)) {
      const res = route.test(path);

      if (res) {
        return { route: name, pathname: path, params: res };
      }
    }

    return { route: null, pathname: path, params: {} };
  }
}
