import { LitElement, html } from "lit";
import type { TemplateResult } from "lit";

import type { Auth } from "../utils/AuthService";
import { APIError } from "./api";

export interface NavigateEvent extends CustomEvent {
  detail: {
    url: string;
    state?: object;
  };
}

export interface NotifyEvent extends CustomEvent {
  detail: {
    /**
     * Notification message body.
     * Example:
     * ```ts
     * message: html`<strong>Look!</strong>`
     * ```
     *
     * Note: In order for `this` methods to work, you'll
     * need to bind `this` or use a fat arrow function.
     * For example:
     * ```ts
     * message: html`<button @click=${this.onClick.bind(this)}>Go!</button>`
     * ```
     * Or:
     * ```ts
     * message: html`<button @click=${(e) => this.onClick(e)}>Go!</button>`
     * ```
     **/
    message: string | TemplateResult;
    /** Notification title */
    title?: string;
    /** Shoelace icon name */
    icon?: string;
    type?: "success" | "warning" | "danger" | "primary" | "info";
    duration?: number;
  };
}

export { html };

export default class LiteElement extends LitElement {
  createRenderRoot() {
    return this;
  }

  navTo(url: string, state?: object): void {
    const evt: NavigateEvent = new CustomEvent("navigate", {
      detail: { url, state },
      bubbles: true,
    });
    this.dispatchEvent(evt);
  }

  /**
   * Bind to anchor tag to prevent full page navigation
   * @example
   * ```ts
   * <a href="/" @click=${this.navLink}>go</a>
   * ```
   * @param event Click event
   */
  navLink(event: Event): void {
    event.preventDefault();

    const evt: NavigateEvent = new CustomEvent("navigate", {
      detail: { url: (event.currentTarget as HTMLAnchorElement).href },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(evt);
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
          const fieldDetail = detail[detail.length - 1];
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
