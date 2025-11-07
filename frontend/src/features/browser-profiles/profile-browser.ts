import { localized, msg, str } from "@lit/localize";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { isApiError, type APIError } from "@/utils/api";
import { tw } from "@/utils/tailwind";

const POLL_INTERVAL_SECONDS = 2;
const hiddenClassList = ["translate-x-2/3", "opacity-0", "pointer-events-none"];

type BrowserResponseData = {
  detail?: string;
  url?: string;
};
export type BrowserLoadDetail = string;
export type BrowserNotAvailableError = {
  error: APIError | Error;
};
export type BrowserConnectionChange = {
  connected: boolean;
};

/**
 * View embedded profile browser
 *
 * Usage example:
 * ```ts
 * <btrix-profile-browser
 *   browserId=${browserId}
 *   initialNavigateUrl=${initialNavigateUrl}
 *   origins=${origins}
 * ></btrix-profile-browser>
 * ```
 *
 * @fires btrix-browser-load Event on iframe load, with src URL
 * @fires btrix-browser-error
 * @fires btrix-browser-reload
 * @fires btrix-browser-connection-change
 */
@customElement("btrix-profile-browser")
@localized()
export class ProfileBrowser extends BtrixElement {
  @property({ type: String })
  browserId?: string;

  @property({ type: String })
  initialNavigateUrl?: string;

  @property({ type: Array })
  origins?: string[];

  @property({ type: Boolean })
  readOnly = false;

  @property({ type: Boolean })
  disableToggleSites = false;

  @state()
  private iframeSrc?: string;

  @state()
  private isIframeLoaded = false;

  @state()
  private browserNotAvailable = false;

  @state()
  private browserDisconnected = false;

  @state()
  private isFullscreen = false;

  @state()
  private showOriginSidebar = false;

  @state()
  private newOrigins?: string[] = [];

  @query("#interactiveBrowser")
  private readonly interactiveBrowser?: HTMLElement;

  @query("#profileBrowserSidebar")
  private readonly sidebar?: HTMLElement;

  @query("#iframeWrapper")
  private readonly iframeWrapper?: HTMLElement;

  @query("iframe")
  private readonly iframe?: HTMLIFrameElement;

  private pollTimerId?: number;

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener("fullscreenchange", this.onFullscreenChange);
    window.addEventListener("beforeunload", this.onBeforeUnload);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    window.clearTimeout(this.pollTimerId);
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
    window.removeEventListener("beforeunload", this.onBeforeUnload);
  }

  private readonly onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (!this.readOnly) {
      e.preventDefault();
    }
  };

  willUpdate(changedProperties: PropertyValues<this> & Map<string, unknown>) {
    if (changedProperties.has("browserId")) {
      if (this.browserId) {
        window.clearTimeout(this.pollTimerId);
        void this.fetchBrowser();
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

  updated(changedProperties: PropertyValues<this> & Map<string, unknown>) {
    if (changedProperties.has("browserDisconnected")) {
      this.dispatchEvent(
        new CustomEvent<BrowserConnectionChange>(
          "btrix-browser-connection-change",
          {
            detail: {
              connected: !this.browserDisconnected,
            },
          },
        ),
      );
    }
    if (changedProperties.has("browserNotAvailable")) {
      if (this.browserNotAvailable) {
        window.removeEventListener("beforeunload", this.onBeforeUnload);
      } else {
        window.addEventListener("beforeunload", this.onBeforeUnload);
      }
      this.dispatchEvent(
        new CustomEvent<BrowserNotAvailableError>("btrix-browser-error"),
      );
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
      <div id="interactiveBrowser" class="flex size-full flex-col">
        ${this.renderControlBar()}
        <div
          id="iframeWrapper"
          class="${this.isFullscreen
            ? "w-screen h-screen"
            : "border-t"} relative flex-1 overflow-hidden bg-neutral-50"
          aria-live="polite"
        >
          ${this.renderBrowser()}
          <div
            id="profileBrowserSidebar"
            class="${hiddenClassList.join(
              " ",
            )} bottom-0 right-0 top-0 flex transition-all duration-300 ease-out lg:absolute lg:w-80 lg:p-3"
          >
            <div
              class="flex-1 overflow-auto rounded-lg border bg-white shadow-lg"
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
          class="fixed left-1/2 top-2 z-50 flex -translate-x-1/2 items-center rounded-lg bg-white text-base shadow"
        >
          ${this.renderSidebarButton()}
          <sl-tooltip content=${msg("Exit Fullscreen")}>
            <sl-icon-button
              name="fullscreen-exit"
              @click=${() => void document.exitFullscreen()}
            ></sl-icon-button>
          </sl-tooltip>
        </div>
      `;
    }

    return html`
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 px-3 text-neutral-700">
          <span id="profileBrowserLabel"> ${msg("Interactive Browser")} </span>
          <btrix-popover
            content=${msg(
              "Interact with this embedded browser to set up your browser profile. The embedded browser will exit without saving changes after a few minutes of inactivity.",
            )}
            placement="right"
            hoist
          >
            <sl-icon
              class="text-base text-neutral-500"
              name="info-circle"
            ></sl-icon>
          </btrix-popover>
        </div>
        <div class="p-1 text-base">
          ${this.renderSidebarButton()}
          <sl-tooltip content=${msg("Enter Fullscreen")}>
            <sl-icon-button
              name="arrows-fullscreen"
              @click=${() => void this.enterFullscreen()}
            ></sl-icon-button>
          </sl-tooltip>
        </div>
      </div>
    `;
  }

  private renderBrowser() {
    if (this.browserNotAvailable) {
      return html`
        <div class="flex aspect-4/3 w-full items-center justify-center">
          <btrix-alert variant="danger">
            <p>
              ${msg(`Interactive browser session timed out due to inactivity.`)}
            </p>
            <div class="py-2 text-center">
              <sl-button size="small" @click=${this.onClickReload}>
                <sl-icon slot="prefix" name="arrow-clockwise"></sl-icon>
                ${msg("Load New Browser")}
              </sl-button>
            </div>
          </btrix-alert>
        </div>
      `;
    }

    if (this.iframeSrc) {
      return html`<div class="relative size-full">
        <iframe
          class=${clsx(
            tw`w-full`,
            this.isFullscreen ? tw`h-full` : tw`aspect-4/3`,
          )}
          src=${this.iframeSrc}
          @load=${this.onIframeLoad}
          aria-labelledby="profileBrowserLabel"
        ></iframe>
        ${when(
          this.browserDisconnected,
          () => html`
            <div
              class="absolute inset-0 flex items-center justify-center"
              style="background-color: var(--sl-overlay-background-color);"
            >
              <btrix-alert variant="danger">
                <p>
                  ${msg(
                    "Connection to interactive browser lost. Waiting to reconnect...",
                  )}
                </p>
              </btrix-alert>
            </div>
          `,
        )}
      </div>`;
    }

    if (this.browserId && !this.isIframeLoaded) {
      return html`
        <div
          class=${clsx(
            tw`flex w-full flex-col items-center justify-center gap-5`,
            this.isFullscreen ? tw`h-full` : tw`aspect-4/3`,
          )}
        >
          <p class="text-neutral-600">
            ${msg("Loading interactive browser...")}
          </p>
          <sl-progress-bar
            class="w-20 [--height:.5rem]"
            indeterminate
          ></sl-progress-bar>
        </div>
      `;
    }

    return "";
  }

  private renderSidebarButton() {
    return html`
      <sl-tooltip content=${msg("Toggle Visited Sites")}>
        <sl-icon-button
          name="layout-sidebar-reverse"
          class="${this.showOriginSidebar ? "text-blue-600" : ""}"
          @click=${() => (this.showOriginSidebar = !this.showOriginSidebar)}
          aria-pressed=${this.showOriginSidebar}
        ></sl-icon-button>
      </sl-tooltip>
    `;
  }

  private renderOrigins() {
    return html`
      <h4 class="border-b p-2 leading-tight text-neutral-700">
        <span class="mr-1 inline-block align-middle"
          >${msg("Visited Sites")}</span
        >
        <btrix-popover
          content=${msg("Websites in the browser profile")}
          placement="top"
          hoist
          ><sl-icon
            class="inline-block align-middle"
            name="info-circle"
          ></sl-icon
        ></btrix-popover>
      </h4>
      <ul>
        ${this.origins?.map((url) => this.renderOriginItem(url))}
      </ul>
    `;
  }

  private renderNewOrigins() {
    if (!this.newOrigins?.length) return;

    return html`
      <h4 class="border-b p-2 leading-tight text-neutral-700">
        <span class="mr-1 inline-block align-middle">${msg("New Sites")}</span>
        <btrix-popover
          content=${msg(
            "Websites that are not in the browser profile yet. Finish browsing and save to add these websites to the profile.",
          )}
          placement="top"
          hoist
          ><sl-icon
            class="inline-block align-middle"
            name="info-circle"
          ></sl-icon
        ></btrix-popover>
      </h4>
      <ul>
        ${this.newOrigins.map((url) => this.renderOriginItem(url))}
      </ul>
    `;
  }

  private renderOriginItem(url: string) {
    return html`<li
      class="border-t-neutral-100${this.iframeSrc
        ? " hover:bg-cyan-50/50 hover:text-cyan-700"
        : ""} flex items-center justify-between border-t p-2 first:border-t-0"
      role=${this.iframeSrc ? "button" : "listitem"}
      title=${msg(str`Go to ${url}`)}
      @click=${() => (this.iframeSrc ? this.navigateBrowser({ url }) : {})}
    >
      <div class="w-full truncate text-sm">${url}</div>
      ${this.iframeSrc
        ? html`<sl-icon name="play-btn" class="text-lg"></sl-icon>`
        : ""}
    </li>`;
  }

  private onClickReload() {
    this.dispatchEvent(new CustomEvent("btrix-browser-reload"));
  }

  /**
   * Fetch browser profile and update internal state
   */
  private async fetchBrowser(): Promise<void> {
    await this.updateComplete;

    this.iframeSrc = undefined;
    this.isIframeLoaded = false;

    await this.checkBrowserStatus();
  }

  /**
   * Check whether temporary browser is up
   **/
  private async checkBrowserStatus() {
    let result: BrowserResponseData;
    try {
      result = await this.getBrowser();
      this.browserNotAvailable = false;
    } catch (e) {
      this.browserNotAvailable = true;
      return;
    }

    if (result.detail === "waiting_for_browser") {
      this.pollTimerId = window.setTimeout(
        () => void this.checkBrowserStatus(),
        POLL_INTERVAL_SECONDS * 1000,
      );

      return;
    } else if (result.url) {
      // check that the browser is actually available
      // if not, continue waiting
      // (will not work with local frontend due to CORS)
      try {
        const resp = await fetch(result.url, { method: "HEAD" });
        if (!resp.ok) {
          this.pollTimerId = window.setTimeout(
            () => void this.checkBrowserStatus(),
            POLL_INTERVAL_SECONDS * 1000,
          );
          return;
        }
      } catch (e) {
        // ignore
      }

      if (this.initialNavigateUrl) {
        await this.navigateBrowser({ url: this.initialNavigateUrl });
      }

      this.iframeSrc = result.url;

      await this.updateComplete;

      this.dispatchEvent(
        new CustomEvent<BrowserLoadDetail>("btrix-browser-load", {
          detail: result.url,
        }),
      );

      void this.pingBrowser();
    } else {
      console.debug("Unknown checkBrowserStatus state");
    }
  }

  private async getBrowser() {
    const data = await this.api.fetch<BrowserResponseData>(
      `/orgs/${this.orgId}/profiles/browser/${this.browserId}`,
    );

    return data;
  }

  /**
   * Navigate to URL in temporary browser
   **/
  private async navigateBrowser({ url }: { url: string }) {
    if (!this.iframeSrc) return;

    const data = this.api.fetch(
      `/orgs/${this.orgId}/profiles/browser/${this.browserId}/navigate`,
      {
        method: "POST",
        body: JSON.stringify({ url }),
      },
    );

    return data;
  }

  /**
   * Ping temporary browser to keep it alive
   **/
  private async pingBrowser() {
    if (!this.iframeSrc) return;

    try {
      const data = await this.api.fetch<{ origins?: string[] }>(
        `/orgs/${this.orgId}/profiles/browser/${this.browserId}/ping`,
        {
          method: "POST",
        },
      );

      if (!this.origins) {
        this.origins = data.origins;
      } else {
        const origins = this.origins;

        this.newOrigins = data.origins?.filter(
          (url: string) =>
            !origins.includes(url) && !origins.includes(url.replace(/\/$/, "")),
        );
      }

      this.browserDisconnected = false;
    } catch (e) {
      if (isApiError(e) && e.details === "no_such_browser") {
        this.browserNotAvailable = true;
      } else {
        this.browserDisconnected = true;
      }

      await this.updateComplete;
    }

    this.pollTimerId = window.setTimeout(
      () => void this.pingBrowser(),
      POLL_INTERVAL_SECONDS * 1000,
    );
  }

  /**
   * Enter fullscreen mode
   */
  private async enterFullscreen() {
    try {
      await this.interactiveBrowser?.requestFullscreen({
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
    } catch (e) {
      /* empty */
    }
    this.dispatchEvent(
      new CustomEvent<BrowserLoadDetail>("btrix-browser-load", {
        detail: this.iframeSrc,
      }),
    );
  }

  private readonly onFullscreenChange = async () => {
    if (document.fullscreenElement) {
      this.isFullscreen = true;
    } else {
      this.isFullscreen = false;
    }
  };
}
