import { LitElement, html } from "lit";

import type { Auth } from "../utils/AuthService";
import { APIError } from "./api";

export { html };

export default class LiteElement extends LitElement {
  createRenderRoot() {
    return this;
  }

  navTo(url: string) {
    this.dispatchEvent(
      new CustomEvent("navigate", { detail: url, bubbles: true })
    );
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

  async apiFetch(
    path: string,
    auth: Auth,
    options?: { method?: string; headers?: any; body?: any }
  ) {
    const { headers, ...opts } = options || {};
    const resp = await fetch("/api" + path, {
      headers: {
        "Content-Type": "application/json",
        ...headers,
        ...auth.headers,
      },
      ...opts,
    });

    if (resp.status !== 200) {
      if (resp.status === 401) {
        this.dispatchEvent(new CustomEvent("need-login"));
      }

      let errorMessage: string;

      try {
        const detail = (await resp.json()).detail;

        if (typeof detail === "string") {
          errorMessage = detail;
        } else {
          // TODO client error details
          errorMessage = "Unknown API error";
        }
      } catch {
        errorMessage = "Unknown API error";
      }

      // TODO client error details
      throw new APIError({
        message: errorMessage,
        status: resp.status,
      });
    }

    return await resp.json();
  }
}
