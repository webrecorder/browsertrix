import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import humanizeDuration from "pretty-ms";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { Crawl } from "./types";

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

  async firstUpdated() {
    try {
      this.crawl = await this.getCrawl();
    } catch {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawl at this time."),
        type: "danger",
        icon: "exclamation-octagon",
        duration: 10000,
      });
    }

    try {
      this.watchUrl = await this.watchCrawl();
      console.log(this.watchUrl);
    } catch (e) {
      console.error(e);
    }
  }

  render() {
    return html`
      <header class="my-3">
        <h2 class="font-mono text-sm text-0-400 h-5">
          ${this.crawl?.id ||
          html`<sl-skeleton style="width: 37em"></sl-skeleton>`}
        </h2>
      </header>

      <main class="grid gap-4">
        <section class="grid grid-cols-2 md:grid-cols-8 gap-5">
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
              : "md:col-span-3"} border rounded-lg p-4 md:p-8"
          >
            ${this.renderDetails()}
          </div>
        </section>

        <section>${this.renderFiles()}</section>
      </main>
    `;
  }

  private renderWatch() {
    const isRunning = this.crawl?.state === "running";

    return html`
      <div
        class="aspect-video bg-slate-50 rounded border ${isRunning
          ? "border-purple-200"
          : "border-slate-100"}"
      >
        <!-- https://github.com/webrecorder/browsertrix-crawler/blob/9f541ab011e8e4bccf8de5bd7dc59b632c694bab/screencast/index.html -->
        [watch/replay]
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
      <dl class="grid gap-5">
        <div>
          <dt class="text-sm text-0-500">${msg("Crawl Template")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  <a
                    class="font-medium  hover:underline"
                    href=${`/archives/${this.crawl.aid}/crawl-templates/${this.crawl.cid}`}
                    @click=${this.navLink}
                    >${this.crawl.configName}</a
                  >
                `
              : html`<sl-skeleton class="h-6"></sl-skeleton>`}
          </dd>
        </div>

        <div>
          <dt class="text-sm text-0-500">${msg("Status")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  <div
                    class="whitespace-nowrap capitalize${isRunning
                      ? " motion-safe:animate-pulse"
                      : ""}"
                  >
                    <span
                      class="inline-block ${this.crawl.state === "failed"
                        ? "text-red-500"
                        : this.crawl.state === "partial_complete"
                        ? "text-emerald-200"
                        : isRunning
                        ? "text-purple-500"
                        : "text-emerald-500"}"
                      style="font-size: 10px; vertical-align: 2px"
                    >
                      &#9679;
                    </span>
                    ${this.crawl.state.replace(/_/g, " ")}
                  </div>
                `
              : html`<sl-skeleton class="h-6"></sl-skeleton>`}
            ${isRunning
              ? html`
                  <div class="mt-2 text-sm leading-none">
                    <button
                      class="px-3 py-2 bg-white border border-purple-400 hover:border-purple-600 text-purple-600 hover:text-purple-500 rounded-sm font-medium mr-2 transition-colors"
                      @click=${this.cancel}
                    >
                      ${msg("Cancel Crawl")}
                    </button>
                    <button
                      class="px-3 py-2 bg-purple-600 hover:bg-purple-500 border border-purple-500 text-white rounded-sm font-medium transition-colors"
                      @click=${this.stop}
                    >
                      ${msg("Stop Crawl")}
                    </button>
                  </div>
                `
              : ""}
          </dd>
        </div>
        <div>
          <dt class="text-sm text-0-500">
            ${this.crawl?.finished ? msg("Finished") : msg("Run duration")}
          </dt>
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
                    : html`<btrix-relative-duration
                        value=${`${this.crawl.started}Z`}
                      ></btrix-relative-duration>`}
                `
              : html`<sl-skeleton class="h-6"></sl-skeleton>`}
          </dd>
        </div>
        <div>
          <dt class="text-sm text-0-500">${msg("Started")}</dt>
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
        <div>
          <dt class="text-sm text-0-500">${msg("Reason")}</dt>
          <dd>
            ${this.crawl
              ? html`
                  ${this.crawl.manual
                    ? msg(
                        html`Manual start by <span>${this.crawl?.user}</span>`
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
      <h3 class="text-lg font-medium mb-2">${msg("Files")}</h3>
      <ul class="border rounded">
        <li class="flex justify-between p-3 border-t first:border-t-0">
          <div>[File name]</div>
          <div>[Download link]</div>
        </li>
        <li class="flex justify-between p-3 border-t first:border-t-0">
          <div>[File name]</div>
          <div>[Download link]</div>
        </li>
      </ul>
    `;
  }

  async getCrawl(): Promise<Crawl> {
    // Mock to use in dev:
    // return import("../../__mocks__/api/archives/[id]/crawls").then(
    //   (module) => module.default.running[0]
    //   // (module) => module.default.finished[0]
    // );

    const data: Crawl = await this.apiFetch(
      `/archives/${this.archiveId}/crawls/${this.crawlId}`,
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
        // TODO
      } else {
        // TODO
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

      if (data.stopped_gracefully === true) {
        // TODO
      } else {
        // TODO
      }
    }
  }

  private updateDuration() {}
}

customElements.define("btrix-crawl-detail", CrawlDetail);
