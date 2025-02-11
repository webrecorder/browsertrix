import queryString from "query-string";
import UrlPattern from "url-pattern";

import type { ROUTES } from "@/routes";

type RouteName = keyof typeof ROUTES;
type Routes = Record<RouteName, UrlPattern>;
type Paths = Record<RouteName, string>;

export type ViewState = {
  // route name, e.g. "admin"
  route: RouteName | null;
  // path name
  // e.g. "/dashboard"
  // e.g. "/users/abc123"
  pathname: string;
  // params from URL (:) or query (?)
  // e.g. "/users/:id"
  // e.g. "/redirect?url"
  params: { slug?: string } & { [key: string]: string };
  // arbitrary data to pass between routes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: { [key: string]: any };
};

export default class APIRouter {
  private readonly routes: Routes;

  constructor(paths: Paths) {
    const routes: { [key: string]: UrlPattern } = {};

    for (const [name, route] of Object.entries(paths)) {
      routes[name] = new UrlPattern(route);
    }

    this.routes = routes as Routes;
  }

  match(relativePath: string): ViewState {
    for (const [name, pattern] of Object.entries(this.routes)) {
      const [path, qs = ""] = relativePath.split("?");
      const match = pattern.match(path);

      if (match) {
        const queryParams = queryString.parse(qs, {
          // Only decode if needed, or else `+` in invite emails
          // may be incorrectly decoded
          decode: qs.includes("%"),
        });
        const params = {
          ...match,
          ...queryParams,
        };
        return { route: name as RouteName, pathname: relativePath, params };
      }
    }

    return { route: null, pathname: relativePath, params: {} };
  }
}
