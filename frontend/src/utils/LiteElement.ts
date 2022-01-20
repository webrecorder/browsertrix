import { LitElement, html } from "lit";

import type { Auth } from "../utils/AuthService";
import { APIError } from "./api";

export interface NotifyEvent extends CustomEvent {
  detail: {
    /**
     * Can contain HTML
     * HTML is rendered as-is without sanitation
     * */
    message: string;
    title?: string;
    type?: "success" | "warning" | "danger" | "primary" | "info";
    icon?: string;
    duration?: number;
  };
}

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

  /**
   * Emit global notification
   */
  notify(detail: NotifyEvent["detail"]) {
    this.dispatchEvent(
      new CustomEvent("notify", {
        bubbles: true,
        detail,
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
          // TODO return client error details
          const fieldDetail = detail[0];
          const { loc, msg } = fieldDetail;

          errorMessage = `${loc[loc.length - 1]} ${msg}`;
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
