import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import humanizeDuration from "pretty-ms";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";

type Crawl = {
  id: string;
  user: string;
  aid: string;
  cid: string;
  schedule: string;
  manual: boolean;
  started: string; // UTC ISO date
  finished?: string; // UTC ISO date
  state: string; // "running" | "complete" | "failed" | "partial_complete"
  scale: number;
  stats: { done: number; found: number } | null;
  files?: { filename: string; hash: string; size: number }[];
  completions?: number;
};

/**
 * Usage:
 * ```ts
 * <btrix-crawls-list></btrix-crawls-list>
 * ```
 */
@localized()
export class CrawlsList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @state()
  private lastFetched?: number;

  @state()
  private runningCrawls?: Crawl[];

  @state()
  private finishedCrawls?: Crawl[];

  async firstUpdated() {
    try {
      const { running, finished } = await this.getCrawls();

      this.runningCrawls = running;
      this.finishedCrawls = finished;
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawls at this time."),
        type: "danger",
        icon: "exclamation-octagon",
        duration: 10000,
      });
    }
  }

  render() {
    if (!this.runningCrawls || !this.finishedCrawls) {
      return html`<div
        class="w-full flex items-center justify-center my-24 text-4xl"
      >
        <sl-spinner></sl-spinner>
      </div>`;
    }

    return html`
      <main class="grid grid-cols-5 gap-5">
        <header class="col-span-5 flex justify-between">
          <div><sl-button>${msg("New Crawl")}</sl-button></div>
          <div>[Sort by]</div>
        </header>

        <section class="col-span-5 lg:col-span-1">[Filters]</section>
        <section class="col-span-5 lg:col-span-4 border rounded">
          <ul>
            ${this.runningCrawls.map(this.renderCrawlItem)}
            ${this.finishedCrawls.map(this.renderCrawlItem)}
          </ul>
        </section>
      </main>
      <footer>${this.lastFetched}</footer>
    `;
  }

  private renderCrawlItem = (crawl: Crawl) => {
    return html`<li
      class="grid grid-cols-12 gap-4 md:gap-6 p-4 leading-none border-t first:border-t-0"
    >
      <div class="col-span-12 md:col-span-4">
        <div class="font-medium whitespace-nowrap truncate mb-1">
          ${crawl.id}
        </div>
        <div class="text-0-500 text-sm whitespace-nowrap truncate">
          <a
            class="hover:underline"
            href=${`/archives/${crawl.aid}/crawl-templates/${crawl.cid}`}
            @click=${this.navLink}
            >${crawl.cid}</a
          >
        </div>
      </div>
      <div class="col-span-6 md:col-span-3">
        <div
          class="whitespace-nowrap truncate mb-1${crawl.state === "running"
            ? " motion-safe:animate-pulse"
            : ""}"
        >
          <!-- TODO switch case in lit template? needed for tailwindcss purging -->
          <span
            class="inline-block align-middle ${crawl.state === "failed"
              ? "text-red-500"
              : crawl.state === "partial_complete"
              ? "text-emerald-200"
              : crawl.state === "running"
              ? "text-purple-500"
              : "text-emerald-500"}"
            style="font-size: 10px"
          >
            &#9679;
          </span>
          <span class="inline-block align-middle capitalize"
            >${crawl.state.replace(/_/g, " ")}</span
          >
        </div>
        <div class="text-0-500 text-sm whitespace-nowrap truncate">
          ${crawl.finished
            ? html`
                <sl-format-date
                  class="inline-block align-middle text-0-600"
                  date=${`${crawl.finished}Z` /** Z for UTC */}
                  month="2-digit"
                  day="2-digit"
                  year="2-digit"
                  hour="numeric"
                  minute="numeric"
                ></sl-format-date>
              `
            : humanizeDuration(
                Date.now() - new Date(`${crawl.started}Z`).valueOf(),
                {
                  secondsDecimalDigits: 0,
                }
              )}
        </div>
      </div>
      <div class="col-span-6 md:col-span-4">
        <div class="whitespace-nowrap truncate mb-1">
          <sl-relative-time
            date=${`${crawl.started}Z` /** Z for UTC */}
            sync
          ></sl-relative-time>
        </div>
        <div class="text-0-500 text-sm whitespace-nowrap truncate">
          ${crawl.manual
            ? msg(html`Manual start by <span>${crawl.user}</span>`)
            : msg(html`Scheduled run`)}
        </div>
      </div>
      <div class="col-span-12 md:col-span-1 text-right">
        <sl-dropdown>
          <sl-icon-button
            slot="trigger"
            name="three-dots"
            label="More"
            style="font-size: 1rem"
          ></sl-icon-button>

          <ul class="text-sm whitespace-nowrap" role="menu">
            <li class="p-2 hover:bg-zinc-100 cursor-pointer" role="menuitem">
              [item]
            </li>
          </ul>
        </sl-dropdown>
      </div>
    </li>`;
  };

  private async getCrawls(): Promise<{ running: Crawl[]; finished: Crawl[] }> {
    // TODO remove mock
    return import("../../__mocks__/api/archives/[id]/crawls").then(
      (module) => module.default
    );

    // const data = await this.apiFetch(
    //   `/archives/${this.archiveId}/crawls`,
    //   this.authState!
    // );

    // this.lastFetched = Date.now();

    // return data;
  }
}

customElements.define("btrix-crawls-list", CrawlsList);
