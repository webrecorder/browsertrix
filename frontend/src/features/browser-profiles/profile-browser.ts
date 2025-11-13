import { localized, msg, str } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import { html, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { cache } from "lit/directives/cache.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { emptyMessage } from "@/layouts/emptyMessage";
import { isApiError, type APIError } from "@/utils/api";
import { tw } from "@/utils/tailwind";

// Matches background of embedded browser
// TODO See if this can be configurable via API
export const bgClass = tw`bg-[#282828]`;

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

const isPolling = (value: unknown): value is number => {
  return typeof value === "number";
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
 * @cssPart base
 * @cssPart browser
 * @cssPart iframe
 */
@customElement("btrix-profile-browser")
@localized()
export class ProfileBrowser extends BtrixElement {
  @property({ type: String })
  browserId?: string;

  @property({ type: String })
  initialNavigateUrl?: string;

  @property({ type: Boolean })
  hideControls = false;

  @state()
  private isFullscreen = false;

  @state()
  private showOriginSidebar = false;

  @query("#interactiveBrowser")
  private readonly interactiveBrowser?: HTMLElement;

  @query("#profileBrowserSidebar")
  private readonly sidebar?: HTMLElement;

  @query("iframe")
  private readonly iframe?: HTMLIFrameElement;

  /**
   * Get temporary browser.
   * If the browser is not available, the task also handles polling.
   */
  private readonly browserTask = new Task(this, {
    task: async ([browserId], { signal }) => {
      if (!browserId) {
        console.debug("missing browserId");
        return;
      }

      if (isPolling(this.browserTask.value)) {
        window.clearTimeout(this.browserTask.value);
      }

      const poll = () =>
        window.setTimeout(() => {
          if (!signal.aborted) {
            void this.browserTask.run();
          }
        }, POLL_INTERVAL_SECONDS * 1000);

      let data: BrowserResponseData;

      try {
        data = await this.getBrowser(browserId, signal);
      } catch (err) {
        void this.onBrowserError();
        throw err;
      }

      // Check whether temporary browser is up
      if (data.detail === "waiting_for_browser") {
        return poll();
      }

      if (data.url) {
        // check that the browser is actually available
        // if not, continue waiting
        // (will not work with local frontend due to CORS)
        try {
          const resp = await fetch(data.url, { method: "HEAD" });
          if (!resp.ok) {
            return poll();
          }
        } catch (err) {
          console.debug(err);
        }
      }

      if (this.initialNavigateUrl) {
        await this.navigateBrowser({ url: this.initialNavigateUrl }, signal);
      }

      window.addEventListener("beforeunload", this.onBeforeUnload);

      this.dispatchEvent(
        new CustomEvent<BrowserLoadDetail>("btrix-browser-load", {
          detail: data.url,
        }),
      );

      return {
        id: browserId,
        ...data,
      };
    },
    args: () => [this.browserId] as const,
  });

  /**
   * Get updated origins list in temporary browser
   */
  private readonly originsTask = new Task(this, {
    task: async ([browser], { signal }) => {
      window.clearTimeout(this.pingTask.value);

      if (!browser || isPolling(browser)) return;

      try {
        const data = await this.pingBrowser(browser.id, signal);

        return data.origins;
      } catch (err) {
        if (isApiError(err) && err.details === "no_such_browser") {
          void this.onBrowserError();
        } else {
          void this.onBrowserDisconnected();
        }

        throw err;
      }
    },
    args: () => [this.browserTask.value] as const,
  });

  /**
   * Keep temporary browser alive by polling for origins list
   */
  private readonly pingTask = new Task(this, {
    task: async ([origins], { signal }) => {
      window.clearTimeout(this.pingTask.value);

      if (!origins) {
        return;
      }

      return window.setTimeout(() => {
        if (!signal.aborted) {
          void this.originsTask.run();
        }
      }, POLL_INTERVAL_SECONDS * 1000);
    },
    args: () => [this.originsTask.value] as const,
  });

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener("fullscreenchange", this.onFullscreenChange);
  }

  disconnectedCallback() {
    if (isPolling(this.browserTask.value))
      window.clearTimeout(this.browserTask.value);

    window.clearTimeout(this.pingTask.value);

    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
    window.removeEventListener("beforeunload", this.onBeforeUnload);

    super.disconnectedCallback();
  }

  private readonly onBeforeUnload = (e: BeforeUnloadEvent) => {
    e.preventDefault();
  };

  private readonly onBrowserError = async () => {
    window.removeEventListener("beforeunload", this.onBeforeUnload);

    await this.updateComplete;
    this.dispatchEvent(
      new CustomEvent<BrowserNotAvailableError>("btrix-browser-error"),
    );
  };

  private readonly onBrowserDisconnected = async () => {
    window.removeEventListener("beforeunload", this.onBeforeUnload);

    await this.updateComplete;
    this.dispatchEvent(
      new CustomEvent<BrowserConnectionChange>(
        "btrix-browser-connection-change",
        {
          detail: { connected: false },
        },
      ),
    );
  };

  willUpdate(changedProperties: PropertyValues<this> & Map<string, unknown>) {
    if (
      changedProperties.has("showOriginSidebar") &&
      changedProperties.get("showOriginSidebar") !== undefined
    ) {
      this.animateSidebar();
    }
  }

  public toggleOrigins() {
    this.showOriginSidebar = !this.showOriginSidebar;
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
    const loadingMsgChangeDelay = 10000;
    const browserLoading = () =>
      cache(
        html`<div
          class="flex size-full flex-col items-center justify-center gap-5"
        >
          <div
            class="relative min-h-5 w-full max-w-prose leading-none text-neutral-200"
          >
            <sl-animation
              name="fadeOut"
              iterations="1"
              delay=${loadingMsgChangeDelay}
              play
              fill="both"
            >
              <p class="absolute min-h-5 w-full text-center">
                ${msg("Loading interactive browser...")}
              </p>
            </sl-animation>
            <sl-animation
              name="fadeIn"
              iterations="1"
              delay=${loadingMsgChangeDelay}
              play
              fill="both"
            >
              <p class="absolute min-h-5 w-full text-center">
                ${msg("Browser is still warming up...")}
              </p>
            </sl-animation>
          </div>

          <sl-progress-bar
            class="w-20 [--height:.5rem] [--indicator-color:var(--sl-color-primary-400)] [--track-color:rgba(255,255,255,0.1)]"
            indeterminate
          ></sl-progress-bar>
        </div>`,
      );

    return html`
      <div
        id="interactiveBrowser"
        class="${bgClass} flex size-full flex-col"
        part="base"
      >
        ${this.renderControlBar()}
        <div
          id="iframeWrapper"
          class="${this.isFullscreen
            ? "w-screen h-screen"
            : this.hideControls
              ? ""
              : "border-t"} relative flex-1 overflow-hidden"
          aria-live="polite"
          part="browser"
        >
          ${this.browserTask.render({
            initial: browserLoading,
            pending: browserLoading,
            error: () => html`
              <div class="flex w-full items-center justify-center">
                <btrix-alert variant="danger">
                  <p>
                    ${msg(
                      `Interactive browser session timed out due to inactivity.`,
                    )}
                  </p>
                  <div class="py-2 text-center">
                    <sl-button size="small" @click=${this.onClickReload}>
                      <sl-icon slot="prefix" name="arrow-clockwise"></sl-icon>
                      ${msg("Load New Browser")}
                    </sl-button>
                  </div>
                </btrix-alert>
              </div>
            `,
            complete: (result) =>
              !result || isPolling(result)
                ? browserLoading()
                : this.renderBrowser(result),
          })}
          <div
            id="profileBrowserSidebar"
            class="${hiddenClassList.join(
              " ",
            )} bottom-0 right-0 top-0 flex transition-all duration-300 ease-out lg:absolute lg:w-80 lg:p-3"
          >
            <div
              class="flex-1 overflow-auto rounded-lg border bg-white shadow-lg"
            >
              ${when(
                this.originsTask.value,
                (origins) => html`
                  ${this.renderOrigins(origins)}
                  ${this.renderNewOrigins(
                    origins.filter(
                      (url: string) =>
                        !origins.includes(url) &&
                        !origins.includes(url.replace(/\/$/, "")),
                    ),
                  )}
                `,
                () =>
                  this.browserTask.status === TaskStatus.PENDING
                    ? emptyMessage({
                        message: msg(
                          "Sites will be shown here once the browser is done loading.",
                        ),
                      })
                    : emptyMessage({
                        message: msg("No sites configured yet."),
                      }),
              )}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private readonly renderControlBar = () => {
    if (this.isFullscreen) {
      return html`
        <div
          class="fixed left-1/2 top-2 z-50 flex -translate-x-1/2 items-center rounded-lg border bg-white text-base shadow-lg"
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

    if (this.hideControls) return;

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
  };

  private readonly renderBrowser = (browser: BrowserResponseData) => {
    return html`<div class="relative size-full">
      ${when(
        browser.url,
        (url) => html`
          <iframe
            class="size-full"
            src=${url}
            @load=${() => void this.onIframeLoad(url)}
            aria-labelledby="profileBrowserLabel"
            part="iframe"
          ></iframe>
        `,
      )}
      ${this.originsTask.render({
        error: () => html`
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
      })}
    </div>`;
  };

  private renderSidebarButton() {
    return html`
      <sl-tooltip content=${msg("Toggle Sites")}>
        <sl-icon-button
          name="layout-sidebar-reverse"
          class="${this.showOriginSidebar ? "text-blue-600" : ""}"
          @click=${() => this.toggleOrigins()}
          aria-pressed=${this.showOriginSidebar}
        ></sl-icon-button>
      </sl-tooltip>
    `;
  }

  private renderOrigins(origins: string[]) {
    return html`
      <header
        class="flex min-h-10 justify-between border-b p-1 leading-tight text-neutral-700"
      >
        <div class="flex items-center gap-1.5 px-2">
          <h4>${msg("Saved Sites")}</h4>
          <btrix-popover
            content=${msg("Websites in the browser profile")}
            placement="top"
            hoist
            ><sl-icon
              class="inline-block align-middle"
              name="info-circle"
            ></sl-icon
          ></btrix-popover>
        </div>
        <sl-icon-button
          name="chevron-bar-right"
          class="text-base"
          @click=${() => (this.showOriginSidebar = false)}
        >
        </sl-icon-button>
      </header>
      <ul>
        ${origins.map((url) => this.renderOriginItem(url))}
      </ul>
    `;
  }

  private renderNewOrigins(origins: string[]) {
    if (!origins.length) return;

    return html`
      <div
        class="flex min-h-10 justify-between border-b p-1 leading-tight text-neutral-700"
      >
        <div class="flex items-center gap-1.5 px-2">
          <h4>${msg("New Sites")}</h4>
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
        </div>
      </div>
      <ul>
        ${origins.map((url) => this.renderOriginItem(url))}
      </ul>
    `;
  }

  private renderOriginItem(url: string) {
    const iframeSrc =
      !isPolling(this.browserTask.value) && this.browserTask.value?.url;

    return html`<li
      class="border-t-neutral-100${iframeSrc
        ? " hover:bg-cyan-50/50 hover:text-cyan-700"
        : ""} flex items-center justify-between border-t px-3 py-2 first:border-t-0"
      role=${iframeSrc ? "button" : "listitem"}
      title=${msg(str`Go to ${url}`)}
      @click=${() => (iframeSrc ? this.navigateBrowser({ url }) : {})}
    >
      <div class="w-full truncate text-sm">${url}</div>
      ${iframeSrc
        ? html`<sl-icon name="play-btn" class="text-lg"></sl-icon>`
        : ""}
    </li>`;
  }

  private onClickReload() {
    this.showOriginSidebar = false;

    this.dispatchEvent(new CustomEvent("btrix-browser-reload"));
  }

  private async getBrowser(browserId: string, signal?: AbortSignal) {
    const data = await this.api.fetch<BrowserResponseData>(
      `/orgs/${this.orgId}/profiles/browser/${browserId}`,
      { signal },
    );

    return data;
  }

  /**
   * Navigate to URL in temporary browser
   **/
  private async navigateBrowser(
    { url }: { url: string },
    signal?: AbortSignal,
  ) {
    const data = this.api.fetch(
      `/orgs/${this.orgId}/profiles/browser/${this.browserId}/navigate`,
      {
        method: "POST",
        body: JSON.stringify({ url }),
        signal,
      },
    );

    return data;
  }

  /**
   * Ping temporary browser to keep it alive
   **/
  private async pingBrowser(browserId: string, signal?: AbortSignal) {
    return this.api.fetch<{ origins?: string[] }>(
      `/orgs/${this.orgId}/profiles/browser/${browserId}/ping`,
      {
        method: "POST",
        signal,
      },
    );
  }

  /**
   * Enter fullscreen mode
   */
  public async enterFullscreen() {
    try {
      await this.interactiveBrowser?.requestFullscreen({
        // Hide browser navigation controls
        navigationUI: "hide",
      });
    } catch (err) {
      console.error(err);
    }
  }

  private async onIframeLoad(url: string) {
    try {
      this.iframe?.contentWindow?.localStorage.setItem("uiTheme", '"default"');
    } catch (err) {
      console.debug(err);
    }

    await this.updateComplete;
    this.dispatchEvent(
      new CustomEvent<BrowserLoadDetail>("btrix-browser-load", {
        detail: url,
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
