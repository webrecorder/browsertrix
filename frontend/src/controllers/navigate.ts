import type { ReactiveController, ReactiveControllerHost } from "lit";

import { $router } from "@/stores/router";
import appState from "@/utils/state";

export type NavigateEventDetail = {
  url: string;
  state?: { [key: string]: unknown };
  resetScroll: boolean;
  replace?: boolean;
};

export interface NavigateEventMap {
  "btrix-navigate": CustomEvent<NavigateEventDetail>;
}

const NAVIGATE_EVENT_NAME: keyof NavigateEventMap = "btrix-navigate";

/**
 * Manage app navigation
 */
export class NavigateController implements ReactiveController {
  private readonly host: ReactiveControllerHost & EventTarget;

  get orgBasePath() {
    const slug = appState.orgSlug;
    if (slug) {
      return `/orgs/${slug}`;
    }
    return "/";
  }

  constructor(host: NavigateController["host"]) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {}
  hostDisconnected() {}

  to = (
    url: string,
    state?: { [key: string]: unknown },
    resetScroll = true,
    replace = false,
  ): void => {
    const evt = new CustomEvent<NavigateEventDetail>(NAVIGATE_EVENT_NAME, {
      detail: { url, state, resetScroll, replace },
      bubbles: true,
      composed: true,
    });

    $router.open(new URL(url, window.location.origin).pathname);

    this.host.dispatchEvent(evt);
  };

  handleAnchorClick = (event: MouseEvent) => {
    if (
      // Detect keypress for opening in a new tab
      event.ctrlKey ||
      event.shiftKey ||
      event.metaKey ||
      (event.button && event.button == 1) ||
      // Account for event prevented on anchor tag
      event.defaultPrevented
    ) {
      return false;
    }

    event.preventDefault();

    return true;
  };

  /**
   * Bind to anchor tag to prevent full page navigation
   * @example
   * ```ts
   * <a href="/" @click=${this.navigate.link}>go</a>
   * ```
   * @param event Click event
   */
  link = (event: MouseEvent, _href?: string, resetScroll = true): void => {
    if (!this.handleAnchorClick(event)) {
      return;
    }

    const el = event.currentTarget as HTMLAnchorElement;

    if (el.ariaDisabled === "true") {
      return;
    }

    $router.open(new URL(el.href, window.location.origin).pathname);

    const evt = new CustomEvent<NavigateEventDetail>(NAVIGATE_EVENT_NAME, {
      detail: {
        url: el.href,
        resetScroll,
      },
      bubbles: true,
      composed: true,
    });
    this.host.dispatchEvent(evt);
  };
}
