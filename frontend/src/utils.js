import "tailwindcss/tailwind.css";

import { LitElement, html } from "lit";
import { Path } from "path-parser";

// ===========================================================================
export class LiteElement extends LitElement {
  createRenderRoot() {
    return this;
  }

  navTo(url) {
    this.dispatchEvent(new CustomEvent("navigate", { detail: url }));
  }

  navLink(event) {
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: event.currentTarget.href,
        bubbles: true,
        composed: true,
      })
    );
  }

  async apiFetch(path, auth) {
    const resp = await fetch("/api" + path, { headers: auth.headers });
    if (resp.status !== 200) {
      this.navTo("/log-in");
      throw new Error("logged out");
    }
    return await resp.json();
  }
}

// ===========================================================================
export class APIRouter {
  constructor(paths) {
    this.routes = {};

    for (const [name, route] of Object.entries(paths)) {
      this.routes[name] = new Path(route);
    }
  }

  match(path) {
    for (const [name, route] of Object.entries(this.routes)) {
      const parts = path.split("?", 2);
      const matchUrl = parts[0];

      const res = route.test(matchUrl);
      if (res) {
        res._route = name;
        res._path = path;
        //res._query = new URLSearchParams(parts.length === 2 ? parts[1] : "");
        return res;
      }
    }

    return { _route: null, _path: path };
  }
}

export { html };
