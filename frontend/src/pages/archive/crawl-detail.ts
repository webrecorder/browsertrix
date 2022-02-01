import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import { RelativeDuration } from "../../components/relative-duration";
import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { Crawl } from "./types";

const POLL_INTERVAL_SECONDS = 10;

/**
 * Usage:
 * ```ts
 * <btrix-crawl-detail></btrix-crawl-detail>
 * ```
 */
@localized()
export class CrawlDetail extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  archiveId?: string;

  @property({ type: String })
  crawlId?: string;

  @state()
  private crawl?: Crawl;

  @state()
  private watchUrl?: string;

  @state()
  private isWatchExpanded: boolean = false;

  // For long polling:
  private timerId?: number;

  // TODO localize
  private numberFormatter = new Intl.NumberFormat();

  async firstUpdated() {
    this.fetchCrawl();

    // try {
    //   this.watchUrl = await this.watchCrawl();
    //   console.log(this.watchUrl);
    // } catch (e) {
    //   console.error(e);
    // }
  }

  disconnectedCallback(): void {
    this.stopPollTimer();
    super.disconnectedCallback();
  }

  render() {
    return html`
      <header class="my-3">
        <h2 class="font-mono text-xs text-0-400 h-4">
          ${this.crawl?.id ||
          html`<sl-skeleton style="width: 37em"></sl-skeleton>`}
        </h2>
      </header>

      <main class="grid gap-5">
        <section
          class="grid grid-cols-2 md:grid-cols-8 gap-3 rounded-lg md:p-4 md:bg-zinc-100"
        >
          <div
            class="col-span-8 ${this.isWatchExpanded
              ? "md:col-span-8"
              : "md:col-span-5"} relative"
          >
            ${this.renderWatch()}
          </div>

          <div
            class="col-span-8 ${this.isWatchExpanded
              ? "md:col-span-8"
              : "md:col-span-3"} border rounded-lg bg-white p-4 md:p-8"
          >
            ${this.renderDetails()}
          </div>
        </section>

        <section>
          <h3 class="text-lg font-medium mb-2">${msg("Download Files")}</h3>
          ${this.renderFiles()}
        </section>
      </main>
    `;
  }

  private renderWatch() {
    const isRunning = this.crawl?.state === "running";

    const bearer = this.authState?.headers?.Authorization?.split(" ", 2)[1];
    const fileJson = `/api/archives/${this.archiveId}/crawls/${this.crawlId}.json?auth_bearer=${bearer}`;

    return html`
      <div
        class="aspect-video rounded border ${isRunning
          ? "border-purple-200"
          : "border-slate-100"}"
      >
        <!-- https://github.com/webrecorder/browsertrix-crawler/blob/9f541ab011e8e4bccf8de5bd7dc59b632c694bab/screencast/index.html -->
        [watch/replay]
        ${this.crawl?.resources?.length ? html`<replay-web-page source="${fileJson}" coll="${this.crawl?.id}" replayBase="/replay/" noSandbox="true"></replay-web-page>` : ``}

      </div>
      <div
        class="absolute top-2 right-2 flex bg-white/90 hover:bg-white rounded-full"
      >
        ${this.isWatchExpanded
          ? html`
              <sl-icon-button
                class="px-1"
                name="arrows-angle-contract"
                label=${msg("Contract crawl video")}
                @click=${() => (this.isWatchExpanded = false)}
              ></sl-icon-button>
            `
          : html`
              <sl-icon-button
                class="px-1"
                name="arrows-angle-expand"
                label=${msg("Expand crawl video")}
                @click=${() => (this.isWatchExpanded = true)}
              ></sl-icon-button>
            `}
        ${this.watchUrl
          ? html`
              <sl-icon-button
                class="border-l px-1"
                href=${this.watchUrl}
                name="box-arrow-up-right"
                label=${msg("Open in new window")}
                target="_blank"
              ></sl-icon-button>
            `
          : ""}
      </div>
    `;
  }

  private renderDetails() {
    const isRunning = this.crawl?.state === "running";

    return html`
      <dl class="grid grid-cols-2 gap-5">
        <div class="col-span-2">
          <dt class="text-sm text-0-600">${msg("Crawl Template")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  <a
                    class="font-medium  hover:underline"
                    href=${`/archives/${this.archiveId}/crawl-templates/config/${this.crawl.cid}`}
                    @click=${this.navLink}
                    >${this.crawl.configName}</a
                  >
                `
              : html`<sl-skeleton class="h-6"></sl-skeleton>`}
          </dd>
        </div>

        <div class="col-span-2">
          <dt class="text-sm text-0-600">${msg("Status")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  <div class="flex items-baseline justify-between">
                    <div
                      class="whitespace-nowrap capitalize${isRunning
                        ? " motion-safe:animate-pulse"
                        : ""}"
                    >
                      <span
                        class="inline-block ${this.crawl.state === "failed"
                          ? "text-red-500"
                          : this.crawl.state === "complete"
                          ? "text-emerald-500"
                          : isRunning
                          ? "text-purple-500"
                          : "text-zinc-300"}"
                        style="font-size: 10px; vertical-align: 2px"
                      >
                        &#9679;
                      </span>
                      ${this.crawl.state.replace(/_/g, " ")}
                    </div>
                  </div>
                `
              : html`<sl-skeleton class="h-6"></sl-skeleton>`}
            ${isRunning
              ? html`
                  <sl-details
                    class="mt-2"
                    style="--sl-spacing-medium: var(--sl-spacing-x-small)"
                  >
                    <span slot="summary" class="text-sm text-0-700">
                      ${msg("Manage")}
                    </span>

                    <div class="mb-3 text-center text-sm leading-none">
                      <sl-button class="mr-2" size="small" @click=${this.stop}>
                        ${msg("Stop Crawl")}
                      </sl-button>
                      <sl-button
                        size="small"
                        type="danger"
                        @click=${this.cancel}
                      >
                        ${msg("Cancel Crawl")}
                      </sl-button>
                    </div>
                  </sl-details>
                `
              : ""}
          </dd>
        </div>
        <div class="col-span-1">
          <dt class="text-sm text-0-600">${msg("Pages Crawled")}</dt>
          <dd>
            ${this.crawl?.stats
              ? html`
                  <span
                    class="font-mono tracking-tighter${isRunning
                      ? " text-purple-600"
                      : ""}"
                  >
                    ${this.numberFormatter.format(+this.crawl.stats.done)}
                    <span class="text-0-400">/</span>
                    ${this.numberFormatter.format(+this.crawl.stats.found)}
                  </span>
                `
              : html`<sl-skeleton class="h-6"></sl-skeleton>`}
          </dd>
        </div>
        <div class="col-span-1">
          <dt class="text-sm text-0-600">${msg("Run Duration")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  ${this.crawl.finished
                    ? html`${RelativeDuration.humanize(
                        new Date(`${this.crawl.finished}Z`).valueOf() -
                          new Date(`${this.crawl.started}Z`).valueOf()
                      )}`
                    : html`
                        <span class="text-purple-600">
                          <btrix-relative-duration
                            value=${`${this.crawl.started}Z`}
                          ></btrix-relative-duration>
                        </span>
                      `}
                `
              : html`<sl-skeleton class="h-6"></sl-skeleton>`}
          </dd>
        </div>
        <div class="col-span-2">
          <dt class="text-sm text-0-600">${msg("Started")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  <sl-format-date
                    date=${`${this.crawl.started}Z` /** Z for UTC */}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="numeric"
                    minute="numeric"
                    time-zone-name="short"
                  ></sl-format-date>
                `
              : html`<sl-skeleton class="h-6"></sl-skeleton>`}
          </dd>
        </div>
        <div class="col-span-2">
          <dt class="text-sm text-0-600">${msg("Finished")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  ${this.crawl.finished
                    ? html`<sl-format-date
                        date=${`${this.crawl.finished}Z` /** Z for UTC */}
                        month="2-digit"
                        day="2-digit"
                        year="2-digit"
                        hour="numeric"
                        minute="numeric"
                        time-zone-name="short"
                      ></sl-format-date>`
                    : html`<span class="text-0-400">${msg("Pending")}</span>`}
                `
              : html`<sl-skeleton class="h-6"></sl-skeleton>`}
          </dd>
        </div>
        <div class="col-span-2">
          <dt class="text-sm text-0-600">${msg("Reason")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  ${this.crawl.manual
                    ? msg(
                        html`Manual start by
                          <span
                            >${this.crawl?.userName || this.crawl?.userid}</span
                          >`
                      )
                    : msg(html`Scheduled run`)}
                `
              : html`<sl-skeleton class="h-6"></sl-skeleton>`}
          </dd>
        </div>
      </dl>
    `;
  }

  private renderFiles() {
    return html`
      <ul class="border rounded text-sm">
        ${this.crawl?.resources?.map(
          (file) => html`
            <li class="flex justify-between p-3 border-t first:border-t-0">
              <div>
                <a
                  class="text-primary hover:underline"
                  href=${file.path}
                  download
                  title=${file.name}
                  >${file.name.slice(
                      file.name.lastIndexOf("/") + 1
                   )}
                </a>
              </div>
              <div><sl-format-bytes value=${file.size}></sl-format-bytes></div>
            </li>
          `
        )}
      </ul>
    `;
  }

  /**
   * Fetch crawl and update internal state
   */
  private async fetchCrawl(): Promise<void> {
    try {
      this.crawl = await this.getCrawl();

      if (this.crawl.state === "running") {
        // Start timer for next poll
        this.timerId = window.setTimeout(() => {
          this.fetchCrawl();
        }, 1000 * POLL_INTERVAL_SECONDS);
      } else {
        this.stopPollTimer();
      }
    } catch {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawl at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  async getCrawl(): Promise<Crawl> {
    // Mock to use in dev:
    // return import("../../__mocks__/api/archives/[id]/crawls").then(
    //   (module) => module.default.running[0]
    //   // (module) => module.default.finished[0]
    // );

    const data: Crawl = await this.apiFetch(
      `/archives/${this.archiveId}/crawls/${this.crawlId}.json`,
      this.authState!
    );

    return data;
  }

  private async watchCrawl(): Promise<string> {
    const data = await this.apiFetch(
      `/archives/${this.archiveId}/crawls/${this.crawlId}/watch`,
      this.authState!,
      {
        method: "POST",
      }
    );

    return data.watch_url;
  }

  private async cancel() {
    if (window.confirm(msg("Are you sure you want to cancel the crawl?"))) {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawls/${this.crawlId}/cancel`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.canceled === true) {
        this.fetchCrawl();
      } else {
        this.notify({
          message: msg("Sorry, couldn't cancel crawl at this time."),
          type: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private async stop() {
    if (window.confirm(msg("Are you sure you want to stop the crawl?"))) {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawls/${this.crawlId}/stop`,
        this.authState!,
        {
          method: "POST",
        }
      );

      if (data.stopping_gracefully === true) {
        this.fetchCrawl();
      } else {
        this.notify({
          message: msg("Sorry, couldn't stop crawl at this time."),
          type: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  private stopPollTimer() {
    window.clearTimeout(this.timerId);
  }
}

customElements.define("btrix-crawl-detail", CrawlDetail);
