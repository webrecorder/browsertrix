import { LitElement, html } from "lit";
import type { TemplateResult } from "lit";
import { msg } from "@lit/localize";

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
    variant?: "success" | "warning" | "danger" | "primary" | "info";
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
      composed: true,
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
  navLink(event: MouseEvent, href?: string): void {
    if (
      // Detect keypress for opening in a new tab
      event.ctrlKey ||
      event.shiftKey ||
      event.metaKey ||
      (event.button && event.button == 1) ||
      // Account for event prevented on anchor tag
      event.defaultPrevented
    ) {
      return;
    }

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
        composed: true,
        detail,
      })
    );
  }

  async apiFetch(
    path: string,
    auth: Auth,
    options?: {
      method?: string;
      headers?: any;
      body?: any;
      signal?: AbortSignal;
      duplex?: string;
    }
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

    const body = await resp.json();
    let detail;
    try {
      detail = body.detail;
    } catch {}

    if (resp.status !== 200) {
      if (resp.status === 401) {
        this.dispatchEvent(new CustomEvent("need-login"));
      }

      if (resp.status === 403 && detail === "storage_quota_reached") {
        this.dispatchEvent(
          new CustomEvent("storage-quota-update", {
            detail: { reached: true },
            bubbles: true,
          })
        );
      }

      let errorMessage: string = msg("Unknown API error");

      if (typeof detail === "string") {
        errorMessage = detail;
      } else if (Array.isArray(detail) && detail.length) {
        const fieldDetail = detail[0];
        const { loc, msg } = fieldDetail;

        const fieldName = loc
          .filter((v: any) => v !== "body" && typeof v === "string")
          .join(" ");
        errorMessage = `${fieldName} ${msg}`;
      }

      throw new APIError({
        message: errorMessage,
        status: resp.status,
        details: detail,
      });
    }

    if (options?.method && options?.method !== "GET") {
      try {
        const storageQuotaReached = body.storageQuotaReached;
        if (typeof storageQuotaReached === "boolean") {
          this.dispatchEvent(
            new CustomEvent("storage-quota-update", {
              detail: { reached: storageQuotaReached },
              bubbles: true,
            })
          );
        }
      } catch {}
    }

    return await body;
  }
}
