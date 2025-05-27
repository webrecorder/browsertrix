import type { ReactiveController, ReactiveControllerHost } from "lit";

import { RouteNamespace } from "@/routes";
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
  static createNavigateEvent = (detail: NavigateEventDetail) =>
    new CustomEvent<NavigateEventDetail>(NAVIGATE_EVENT_NAME, {
      detail,
      bubbles: true,
      composed: true,
    });

  private readonly host: ReactiveControllerHost & EventTarget;

  get orgBasePath() {
    const slug = appState.orgSlug;
    if (slug) {
      return `/${RouteNamespace.PrivateOrgs}/${slug}`;
    }
    return "/";
  }

  get isPublicPage() {
    return window.location.pathname.startsWith(
      `/${RouteNamespace.PublicOrgs}/`,
    );
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
    const evt = NavigateController.createNavigateEvent({
      url,
      state,
      resetScroll,
      replace,
    });
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

    const el = event.currentTarget as HTMLAnchorElement | null;

    if (el?.ariaDisabled === "true") {
      return;
    }

    const evt = NavigateController.createNavigateEvent({
      url: (event.currentTarget as HTMLAnchorElement).href,
      resetScroll,
    });
    this.host.dispatchEvent(evt);
  };
}
