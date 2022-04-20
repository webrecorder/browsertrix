// import { LitElement, html } from "lit";
import { property, state } from "lit/decorators.js";
import { ref } from "lit/directives/ref.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";

const POLL_INTERVAL_SECONDS = 3;

/**
 * View embedded profile browser
 *
 * Usage example:
 * ```ts
 * <btrix-profile-browser
 *   authState=${authState}
 *   archiveId=${archiveId}
 *   browserId=${browserId}
 *   initialNavigateUrl=${initialNavigateUrl}
 *   origins=${origins}
 * ></btrix-profile-browser>
 * ```
 */
@localized()
export class ProfileBrowser extends LiteElement {
  // TODO remove sidebar constaint once devtools panel
  // is hidden on the backend
  static SIDE_BAR_WIDTH = 288;

  /** Profile creation only works in Chromium-based browsers */
  static isBrowserCompatible = Boolean((window as any).chrome);

  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @property({ type: String })
  browserId?: string;

  @property({ type: String })
  initialNavigateUrl?: string;

  @property({ type: Array })
  origins?: string[];

  @state()
  private iframeSrc?: string;

  @state()
  private hasFetchError = false;

  @state()
  private isFullscreen = false;

  @state()
  private newOrigins: string[] = [];

  private pollTimerId?: number;

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener("fullscreenchange", this.onFullscreenChange);
  }

  disconnectedCallback() {
    window.clearTimeout(this.pollTimerId);
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
  }

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has("browserId") && this.browserId) {
      this.fetchBrowser();
    }
  }

  render() {
    return html`
      <div id="interactive-browser" class="lg:flex relative">
        <div class="grow lg:rounded-lg border overflow-hidden bg-slate-50">
          <div
            class="w-full ${this.isFullscreen ? "h-screen" : "h-96"}"
            aria-live="polite"
          >
            ${this.renderBrowser()}
          </div>
          <div
            class="rounded-b lg:rounded-b-none lg:rounded-r border w-72  bg-white absolute h-full top-0 right-0"
          >
            ${this.renderFullscreenButton()} ${this.renderOrigins()}
            ${this.renderNewOrigins()}
          </div>
        </div>
      </div>
    `;
  }

  private renderBrowser() {
    if (!ProfileBrowser.isBrowserCompatible) {
      return html`
        <btrix-alert type="warning" class="text-sm">
          ${msg(
            "Browser profile creation is only supported in Chromium-based browsers (such as Chrome) at this time. Please re-open this page in a compatible browser to proceed."
          )}
        </btrix-alert>
      `;
    }

    if (this.hasFetchError) {
      return html`
        <btrix-alert type="danger">
          ${msg(`The interactive browser is not available.`)}
        </btrix-alert>
      `;
    }

    if (this.iframeSrc) {
      return html`<iframe
        class="w-full h-full"
        title=${msg("Interactive browser for creating browser profile")}
        src=${this.iframeSrc}
        ${ref((el) => this.onIframeRef(el as HTMLIFrameElement))}
      ></iframe>`;
    }

    if (this.browserId && !this.iframeSrc) {
      return html`
        <div
          class="w-full h-full flex items-center justify-center text-4xl"
          style="padding-right: ${ProfileBrowser.SIDE_BAR_WIDTH}px;"
        >
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    return "";
  }

  private renderFullscreenButton() {
    return html`${document.fullscreenEnabled
      ? html`
          <div class="p-2 text-right">
            <sl-button
              size="small"
              @click=${() =>
                this.isFullscreen
                  ? document.exitFullscreen()
                  : this.enterFullscreen("interactive-browser")}
            >
              ${this.isFullscreen
                ? html`
                    <sl-icon
                      slot="prefix"
                      name="fullscreen-exit"
                      label=${msg("Exit fullscreen")}
                    ></sl-icon>
                    ${msg("Exit")}
                  `
                : html`
                    <sl-icon
                      slot="prefix"
                      name="arrows-fullscreen"
                      label=${msg("Enter fullscreen")}
                    ></sl-icon>
                    ${msg("Fullscreen")}
                  `}
            </sl-button>
          </div>
        `
      : ""}`;
  }

  private renderOrigins() {
    return html`
      <h4 class="text-xs text-neutral-500 leading-tight p-2 border-b">
        ${msg("Visited URLs")}
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
        <span class="inline-block align-middle">${msg("Newly Visited")}</span>
        <sl-tooltip
          content=${msg(
            "Newly visited URLs have not been saved to the browser profile yet."
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
   * Fetch browser profiles and update internal state
   */
  private async fetchBrowser(): Promise<void> {
    try {
      await this.checkBrowserStatus();
    } catch (e) {
      this.hasFetchError = true;

      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        type: "danger",
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
      `/archives/${this.archiveId}/profiles/browser/${this.browserId}`,
      this.authState!
    );

    return data;
  }

  /**
   * Navigate to URL in temporary browser
   **/
  private async navigateBrowser({ url }: { url: string }) {
    const data = this.apiFetch(
      `/archives/${this.archiveId}/profiles/browser/${this.browserId}/navigate`,
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
    const data = await this.apiFetch(
      `/archives/${this.archiveId}/profiles/browser/${this.browserId}/ping`,
      this.authState!,
      {
        method: "POST",
      }
    );

    if (!this.origins) {
      this.origins = data.origins;
    } else {
      this.newOrigins = data.origins.filter(
        (url: string) => !this.origins?.includes(url)
      );
    }

    this.pollTimerId = window.setTimeout(() => this.pingBrowser(), 60 * 1000);
  }

  /**
   * Enter fullscreen mode
   * @param id ID of element to fullscreen
   */
  private async enterFullscreen(id: string) {
    try {
      document.getElementById(id)!.requestFullscreen({
        // Show browser navigation controls
        navigationUI: "show",
      });
    } catch (err) {
      console.error(err);
    }
  }

  private onFullscreenChange = () => {
    if (document.fullscreenElement) {
      this.isFullscreen = true;
    } else {
      this.isFullscreen = false;
    }
  };

  private onIframeRef(el: HTMLIFrameElement) {
    if (!el) return;

    el.addEventListener("load", () => {
      // TODO see if we can make this work locally without CORs errors
      try {
        //el.style.width = "132%";
        el.contentWindow?.localStorage.setItem("uiTheme", '"default"');
        el.contentWindow?.localStorage.setItem(
          "InspectorView.screencastSplitViewState",
          `{"vertical":{"size":${ProfileBrowser.SIDE_BAR_WIDTH}}}`
        );
      } catch (e) {}
    });
  }
}
