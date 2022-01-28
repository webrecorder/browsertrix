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
  }

  render() {
    // if (!this.crawl) {
    //   return html`<div
    //     class="w-full flex items-center justify-center my-24 text-4xl"
    //   >
    //     <sl-spinner></sl-spinner>
    //   </div>`;
    // }

    const isRunning = this.crawl?.state === "running";

    return html`
      <header class="px-4 py-3 border-t border-b mb-4 text-sm">
        <dl class="grid grid-cols-2 gap-10">
          <div>
            <dt class="text-xs text-0-500">${msg("Crawl ID")}</dt>
            <dd class="text-0-700">
              <div class="text-sm font-mono truncate">
                ${this.crawl?.id || html`<sl-skeleton></sl-skeleton>`}
              </div>
            </dd>
          </div>
          <div>
            <dt class="text-xs text-0-500">${msg("Crawl Template")}</dt>
            <dd class="text-0-700">
              <div class="text-sm font-mono truncate">
                ${this.crawl
                  ? html`
                      <a
                        class="hover:underline"
                        href=${`/archives/${this.crawl.aid}/crawl-templates/${this.crawl.cid}`}
                        @click=${this.navLink}
                        >${this.crawl.cid}</a
                      >
                    `
                  : html`<sl-skeleton></sl-skeleton>`}
              </div>
            </dd>
          </div>
        </dl>
      </header>

      <main class="grid gap-4">
        <section class="grid grid-cols-2 md:grid-cols-8 gap-5">
          <div class="col-span-8 md:col-span-5 relative">
            <div
              class="aspect-video bg-slate-50 rounded border ${isRunning
                ? "border-purple-200"
                : "border-slate-100"}"
            >
              [watch/replay]
            </div>
            <div class="absolute top-2 right-2 bg-white/90 rounded-full">
              <sl-icon-button
                name="arrows-fullscreen"
                label=${msg("Fullscreen")}
              ></sl-icon-button>
            </div>
          </div>

          <div class="col-span-8 md:col-span-3 border rounded p-4 md:p-8">
            <dl class="grid gap-5">
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
                    : html`<sl-skeleton></sl-skeleton>`}
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
                  ${this.crawl?.finished
                    ? msg("Finished")
                    : msg("Run duration")}
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
                          : humanizeDuration(
                              Date.now() -
                                new Date(`${this.crawl.started}Z`).valueOf()
                            )}
                      `
                    : html`<sl-skeleton></sl-skeleton>`}
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
                    : html`<sl-skeleton></sl-skeleton>`}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-0-500">${msg("Reason")}</dt>
                <dd>
                  ${this.crawl
                    ? html`
                        ${this.crawl.manual
                          ? msg(
                              html`Manual start by
                                <span>${this.crawl?.user}</span>`
                            )
                          : msg(html`Scheduled run`)}
                      `
                    : html`<sl-skeleton></sl-skeleton>`}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </main>
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

  async cancel() {
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

  async stop() {
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
}

customElements.define("btrix-crawl-detail", CrawlDetail);
