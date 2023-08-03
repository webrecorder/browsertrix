// import { LitElement, html } from "lit";
import { property, state, query } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";

const POLL_INTERVAL_SECONDS = 2;
const hiddenClassList = ["translate-x-2/3", "opacity-0", "pointer-events-none"];

/**
 * View embedded profile browser
 *
 * Usage example:
 * ```ts
 * <btrix-profile-browser
 *   authState=${authState}
 *   orgId=${orgId}
 *   browserId=${browserId}
 *   initialNavigateUrl=${initialNavigateUrl}
 *   origins=${origins}
 * ></btrix-profile-browser>
 * ```
 *
 * @event load Event on iframe load, with src URL
 */
@localized()
export class ProfileBrowser extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  browserId?: string;

  @property({ type: String })
  initialNavigateUrl?: string;

  @property({ type: Array })
  origins?: string[];

  @state()
  private iframeSrc?: string;

  @state()
  private isIframeLoaded = false;

  @state()
  private hasFetchError = false;

  @state()
  private isFullscreen = false;

  @state()
  private showOriginSidebar = false;

  @state()
  private newOrigins: string[] = [];

  @query("#profileBrowserSidebar")
  private sidebar?: HTMLElement;

  @query("#iframeWrapper")
  private iframeWrapper?: HTMLElement;

  @query("iframe")
  private iframe?: HTMLIFrameElement;

  private pollTimerId?: number;

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener("fullscreenchange", this.onFullscreenChange);
  }

  disconnectedCallback() {
    window.clearTimeout(this.pollTimerId);
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("browserId")) {
      if (this.browserId) {
        window.clearTimeout(this.pollTimerId);
        this.fetchBrowser();
      } else if (changedProperties.get("browserId")) {
        this.iframeSrc = undefined;
        this.isIframeLoaded = false;

        window.clearTimeout(this.pollTimerId);
      }
    }
    if (
      changedProperties.has("showOriginSidebar") &&
      changedProperties.get("showOriginSidebar") !== undefined
    ) {
      this.animateSidebar();
    }
  }

  private animateSidebar() {
    if (!this.sidebar) return;
    if (this.showOriginSidebar) {
      this.sidebar.classList.remove(...hiddenClassList);
    } else {
      this.sidebar.classList.add(...hiddenClassList);
    }
  }

  render() {
    return html`
      <div id="interactive-browser" class="w-full h-full flex flex-col">
        ${this.renderControlBar()}
        <div
          id="iframeWrapper"
          class="${this.isFullscreen
            ? "w-screen h-screen"
            : "border-t"} flex-1 relative bg-neutral-50 overflow-hidden"
          aria-live="polite"
        >
          ${this.renderBrowser()}
          <div
            id="profileBrowserSidebar"
            class="${hiddenClassList.join(
              " "
            )} lg:absolute top-0 right-0 bottom-0 lg:w-80 lg:p-3 flex transition-all duration-300 ease-out"
          >
            <div
              class="shadow-lg overflow-auto border rounded-lg bg-white flex-1"
            >
              ${this.renderOrigins()} ${this.renderNewOrigins()}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderControlBar() {
    if (this.isFullscreen) {
      return html`
        <div
          class="fixed top-2 left-1/2 bg-white rounded-lg shadow z-50 -translate-x-1/2 flex items-center text-base"
        >
          ${this.renderSidebarButton()}
          <sl-icon-button
            name="fullscreen-exit"
            label=${msg("Exit fullscreen")}
            @click=${() => document.exitFullscreen()}
          ></sl-icon-button>
        </div>
      `;
    }

    return html`
      <div class="text-right text-base p-1">
        ${this.renderSidebarButton()}
        <sl-icon-button
          name="arrows-fullscreen"
          label=${msg("Enter fullscreen")}
          @click=${() => this.enterFullscreen("interactive-browser")}
        ></sl-icon-button>
      </div>
    `;
  }

  private renderBrowser() {
    if (this.hasFetchError) {
      return html`
        <btrix-alert variant="danger">
          ${msg(`The interactive browser is not available.`)}
        </btrix-alert>
      `;
    }

    if (this.iframeSrc) {
      return html`<iframe
        class="w-full h-full"
        title=${msg("Interactive browser for creating browser profile")}
        src=${this.iframeSrc}
        @load=${this.onIframeLoad}
      ></iframe>`;
    }

    if (this.browserId && !this.isIframeLoaded) {
      return html`
        <div class="w-full h-full flex items-center justify-center text-3xl">
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    return "";
  }

  private renderSidebarButton() {
    return html`
      <sl-icon-button
        name="layout-sidebar-reverse"
        label=${!this.showOriginSidebar
          ? msg("Show sidebar")
          : msg("Hide sidebar")}
        class="${this.showOriginSidebar ? "text-blue-600" : ""}"
        @click=${() => (this.showOriginSidebar = !this.showOriginSidebar)}
      ></sl-icon-button>
    `;
  }

  private renderOrigins() {
    return html`
      <h4 class="text-xs text-neutral-500 leading-tight p-2 border-b">
        <span class="inline-block align-middle">${msg("Visited Sites")}</span>
        <sl-tooltip content=${msg("Websites in the browser profile")}
          ><sl-icon
            class="inline-block align-middle"
            name="info-circle"
          ></sl-icon
        ></sl-tooltip>
      </h4>
      <ul>
        ${this.origins?.map((url) => this.renderOriginItem(url))}
      </ul>
    `;
  }

  private renderNewOrigins() {
    if (!this.newOrigins.length) return;

    return html`
      <h4 class="text-xs text-neutral-500 leading-tight p-2 border-b">
        <span class="inline-block align-middle">${msg("New Sites")}</span>
        <sl-tooltip
          content=${msg(
            "Websites that are not in the browser profile yet. Finish editing and save to add these websites to the profile."
          )}
          ><sl-icon
            class="inline-block align-middle"
            name="info-circle"
          ></sl-icon
        ></sl-tooltip>
      </h4>
      <ul>
        ${this.newOrigins.map((url) => this.renderOriginItem(url))}
      </ul>
    `;
  }

  private renderOriginItem(url: string) {
    return html`<li
      class="p-2 flex items-center justify-between border-t first:border-t-0 border-t-neutral-100${this
        .iframeSrc
        ? " hover:bg-slate-50 hover:text-primary"
        : ""}"
      role=${this.iframeSrc ? "button" : "listitem"}
      title=${msg(str`Go to ${url}`)}
      @click=${() => (this.iframeSrc ? this.navigateBrowser({ url }) : {})}
    >
      <div class="text-sm truncate w-full">${url}</div>
      ${this.iframeSrc
        ? html`<sl-icon name="play-btn" class="text-xl"></sl-icon>`
        : ""}
    </li>`;
  }

  /**
   * Fetch browser profile and update internal state
   */
  private async fetchBrowser(): Promise<void> {
    await this.updateComplete;

    this.iframeSrc = undefined;
    this.isIframeLoaded = false;

    try {
      await this.checkBrowserStatus();
    } catch (e) {
      this.hasFetchError = true;

      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  /**
   * Check whether temporary browser is up
   **/
  private async checkBrowserStatus() {
    const result = await this.getBrowser();

    if (result.detail === "waiting_for_browser") {
      this.pollTimerId = window.setTimeout(
        () => this.checkBrowserStatus(),
        POLL_INTERVAL_SECONDS * 1000
      );

      return;
    } else if (result.url) {
      if (this.initialNavigateUrl) {
        await this.navigateBrowser({ url: this.initialNavigateUrl });
      }

      this.iframeSrc = result.url;

      await this.updateComplete;

      this.dispatchEvent(new CustomEvent("load", { detail: result.url }));

      this.pingBrowser();
    } else {
      console.debug("Unknown checkBrowserStatus state");
    }
  }

  private async getBrowser(): Promise<{
    detail?: string;
    url?: string;
  }> {
    const data = await this.apiFetch(
      `/orgs/${this.orgId}/profiles/browser/${this.browserId}`,
      this.authState!
    );

    return data;
  }

  /**
   * Navigate to URL in temporary browser
   **/
  private async navigateBrowser({ url }: { url: string }) {
    if (!this.iframeSrc) return;

    const data = this.apiFetch(
      `/orgs/${this.orgId}/profiles/browser/${this.browserId}/navigate`,
      this.authState!,
      {
        method: "POST",
        body: JSON.stringify({ url }),
      }
    );

    return data;
  }

  /**
   * Ping temporary browser every minute to keep it alive
   **/
  private async pingBrowser() {
    if (!this.iframeSrc) return;

    const data = await this.apiFetch(
      `/orgs/${this.orgId}/profiles/browser/${this.browserId}/ping`,
      this.authState!,
      {
        method: "POST",
      }
    );

    if (!this.origins) {
      this.origins = data.origins;
    } else {
      this.newOrigins = data.origins?.filter(
        (url: string) => !this.origins?.includes(url)
      );
    }

    this.pollTimerId = window.setTimeout(
      () => this.pingBrowser(),
      POLL_INTERVAL_SECONDS * 1000
    );
  }

  /**
   * Enter fullscreen mode
   * @param id ID of element to fullscreen
   */
  private async enterFullscreen(id: string) {
    try {
      document.getElementById(id)!.requestFullscreen({
        // Hide browser navigation controls
        navigationUI: "hide",
      });
    } catch (err) {
      console.error(err);
    }
  }

  private onIframeLoad() {
    this.isIframeLoaded = true;
    try {
      this.iframe?.contentWindow?.localStorage.setItem("uiTheme", '"default"');
    } catch (e) {}
    this.dispatchEvent(new CustomEvent("load", { detail: this.iframeSrc }));
  }

  private onFullscreenChange = async () => {
    if (document.fullscreenElement) {
      this.isFullscreen = true;
    } else {
      this.isFullscreen = false;
    }
  };
}
