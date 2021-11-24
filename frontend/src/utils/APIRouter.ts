import { Path } from "path-parser";

type Routes = { [key: string]: Path };
type Paths = { [key: string]: string };

export type ViewState = {
  _route: string | null;
  _path: string;
  _params: { [key: string]: string };
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
      const res = route.test(path);

      if (res) {
        return { _route: name, _path: path, _params: res };
      }
    }

    return { _route: null, _path: path, _params: {} };
  }
}
