import queryString from "query-string";
import UrlPattern from "url-pattern";

type Paths = { [key: string]: string };
type Routes<T extends Paths> = { [key in keyof T]: UrlPattern };

export type ViewState<T extends Paths> = {
  // route name, e.g. "admin"
  route: keyof T | null;
  // path name
  // e.g. "/dashboard"
  // e.g. "/users/abc123"
  pathname: string;
  // params from URL (:) or query (?)
  // e.g. "/users/:id"
  // e.g. "/redirect?url"
  params: { [key: string]: string };
  // arbitrary data to pass between routes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: { [key: string]: any };
};

export default class APIRouter<const T extends Paths> {
  private readonly routes: Routes<T>;

  constructor(paths: T) {
    this.routes = {} as Routes<T>;

    for (const [name, route] of Object.entries(paths) as [keyof T, string][]) {
      this.routes[name] = new UrlPattern(route);
    }
  }

  match(relativePath: string): ViewState<T> {
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
        return { route: name, pathname: relativePath, params };
      }
    }

    return { route: null, pathname: relativePath, params: {} };
  }
}
