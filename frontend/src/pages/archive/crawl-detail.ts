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
      this.crawl = await this.getCrawlTemplate();
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
    if (!this.crawl) {
      return html`<div
        class="w-full flex items-center justify-center my-24 text-4xl"
      >
        <sl-spinner></sl-spinner>
      </div>`;
    }

    const isRunning = this.crawl.state === "running";

    return html`
      <header class="px-4 py-3 border-t border-b mb-4 text-sm">
        <dl class="grid grid-cols-2 gap-5">
          <div>
            <dt class="text-xs text-0-600">${msg("Crawl ID")}</dt>
            <dd>
              <div class="text-sm font-mono truncate">${this.crawl.id}</div>
            </dd>
          </div>
          <div>
            <dt class="text-xs text-0-600">${msg("Crawl Template")}</dt>
            <dd>
              <div class="text-sm font-mono truncate">
                <a
                  class="hover:underline"
                  href=${`/archives/${this.crawl.aid}/crawl-templates/${this.crawl.cid}`}
                  @click=${this.navLink}
                  >${this.crawl.cid}</a
                >
              </div>
            </dd>
          </div>
        </dl>
      </header>

      ${isRunning
        ? html`
            <div
              class="flex items-center justify-between border rounded-lg bg-purple-50 border-purple-300 text-purple-800 p-4 mb-4"
            >
              <p class="font-medium">${msg("Crawl is currently running.")}</p>
              <div>
                <sl-button size="small" class="mr-2"
                  >${msg("Cancel Crawl")}</sl-button
                >
                <sl-button size="small" type="danger"
                  >${msg("Stop Crawl")}</sl-button
                >
              </div>
            </div>
          `
        : ""}

      <main class="grid gap-4">
        <section class="grid grid-cols-2 md:grid-cols-8 gap-5">
          <div class="col-span-8 md:col-span-5">
            <div class="aspect-video bg-slate-50 rounded">[watch/replay]</div>
          </div>

          <div class="col-span-8 md:col-span-3 border rounded p-4 md:p-8">
            <dl class="grid gap-5">
              <div>
                <dt class="text-sm text-0-600">${msg("Status")}</dt>
                <dd class="capitalize">
                  ${this.crawl.state.replace(/_/g, " ")}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-0-600">
                  ${this.crawl.finished ? msg("Finished") : msg("Run duration")}
                </dt>
                <dd>
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
                </dd>
              </div>
              <div>
                <dt class="text-sm text-0-600">${msg("Reason")}</dt>
                <dd>
                  ${this.crawl.manual
                    ? msg(html`Manual start by <span>${this.crawl.user}</span>`)
                    : msg(html`Scheduled run`)}
                </dd>
              </div>
              <div>
                <dt class="text-sm text-0-600">${msg("Started")}</dt>
                <dd>
                  <sl-format-date
                    date=${`${this.crawl.started}Z` /** Z for UTC */}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                    hour="numeric"
                    minute="numeric"
                    time-zone-name="short"
                  ></sl-format-date>
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </main>
    `;
  }

  async getCrawlTemplate(): Promise<Crawl> {
    // Mock to use in dev:
    return import("../../__mocks__/api/archives/[id]/crawls").then(
      // (module) => module.default.running[0]
      (module) => module.default.finished[0]
    );

    // const data: Crawl = await this.apiFetch(
    //   `/archives/${this.archiveId}/crawls/${this.crawlId}`,
    //   this.authState!
    // );

    // return data;
  }
}

customElements.define("btrix-crawl-detail", CrawlDetail);
