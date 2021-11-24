import { LitElement, html } from "lit";
import "tailwindcss/tailwind.css";

import type { Auth } from "../types/auth";

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
      if (resp.status === 401) {
        this.dispatchEvent(
          new CustomEvent("need-login", {
            detail: { api: true },
          })
        );
      }

      // TODO get error details
      let errorMessage: string;

      try {
        errorMessage = (await resp.json()).detail;
      } catch {
        errorMessage = "Unknown API error";
      }
      throw new Error(errorMessage);
    }

    return await resp.json();
  }
}
