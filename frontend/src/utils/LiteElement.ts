import { LitElement, html } from "lit";
import "tailwindcss/tailwind.css";

import type { Auth } from "./auth";

export { html };

export default class LiteElement extends LitElement {
  createRenderRoot() {
    return this;
  }

  navTo(url: string) {
    this.dispatchEvent(new CustomEvent("navigate", { detail: url }));
  }

  navLink(event: Event) {
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: (event.currentTarget as HTMLAnchorElement).href,
        bubbles: true,
        composed: true,
      })
    );
  }

  async apiFetch(path: string, auth: Auth) {
    const resp = await fetch("/api" + path, { headers: auth.headers });
    if (resp.status !== 200) {
      this.navTo("/log-in");
      throw new Error("logged out");
    }
    return await resp.json();
  }
}
