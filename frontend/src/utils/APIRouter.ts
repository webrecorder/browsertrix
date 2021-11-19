import { Path } from "path-parser";

type Routes = { [key: string]: Path };
type Paths = { [key: string]: string };

export type ViewState = {
  _route: string | null;
  _path: string;
};
export type NavigateEvent = {
  detail: string;
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
      const parts = path.split("?", 2);
      const matchUrl = parts[0];

      const res = route.test(matchUrl);
      if (res) {
        res._route = name;
        res._path = path;
        //res._query = new URLSearchParams(parts.length === 2 ? parts[1] : "");
        return res as ViewState;
      }
    }

    return { _route: null, _path: path };
  }
}
