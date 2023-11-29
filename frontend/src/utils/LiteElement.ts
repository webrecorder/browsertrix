import { html } from "lit";
import type { TemplateResult } from "lit";

import { LitElementWithAPIFetch } from "@/components/mixins/api-fetch";
import appState, { use } from "./state";

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

export default class LiteElement extends LitElementWithAPIFetch {
  @use()
  appState = appState;

  protected get orgBasePath() {
    const slug = this.appState.orgSlug;
    if (slug) {
      return `/orgs/${slug}`;
    }
    return "/";
  }

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
  navLink(event: MouseEvent, _href?: string): void {
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
}
