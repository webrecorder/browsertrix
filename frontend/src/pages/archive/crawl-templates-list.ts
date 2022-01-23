import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import cronParser from "cron-parser";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { CrawlTemplate } from "./types";

type RunningCrawlsMap = {
  /** Map of configId: crawlId */
  [configId: string]: string;
};

/**
 * Usage:
 * ```ts
 * <btrix-crawl-templates-list></btrix-crawl-templates-list>
 * ```
 */
@localized()
export class CrawlTemplatesList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @state()
  crawlTemplates?: CrawlTemplate[];

  @state()
  runningCrawlsMap: RunningCrawlsMap = {};

  private get timeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  async firstUpdated() {
    try {
      this.crawlTemplates = await this.getCrawlTemplates();
      if (!this.crawlTemplates.length) {
        this.navTo(`/archives/${this.archiveId}/crawl-templates/new`);
      }
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawl templates at this time."),
        type: "danger",
        icon: "exclamation-octagon",
        duration: 10000,
      });
    }
  }

  render() {
    if (!this.crawlTemplates) {
      return html`<div
        class="w-full flex items-center justify-center my-24 text-4xl"
      >
        <sl-spinner></sl-spinner>
      </div>`;
    }

    return html`
      <div
        class=${this.crawlTemplates.length
          ? "grid sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4"
          : "flex justify-center"}
      >
        <a
          href=${`/archives/${this.archiveId}/crawl-templates/new`}
          class="col-span-1 bg-slate-50 border border-indigo-200 hover:border-indigo-400 text-primary text-center font-medium rounded px-6 py-4 transition-colors"
          @click=${this.navLink}
          role="button"
        >
          <sl-icon
            class="inline-block align-middle mr-2"
            name="plus-square"
          ></sl-icon
          ><span
            class="inline-block align-middle mr-2 ${this.crawlTemplates.length
              ? "text-sm"
              : "font-medium"}"
            >${msg("Create New Crawl Template")}</span
          >
        </a>
      </div>

      <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        ${this.crawlTemplates.map(
          (t) =>
            html`<div
              class="col-span-1 p-1 border hover:border-indigo-200 rounded text-sm transition-colors"
              aria-label=${t.name}
            >
              <header class="flex">
                <a
                  href=${`/archives/${this.archiveId}/crawl-templates/${t.id}`}
                  class="block flex-1 px-3 pt-3 font-medium hover:underline whitespace-nowrap truncate mb-1"
                  title=${t.name}
                  @click=${this.navLink}
                >
                  ${t.name || "?"}
                </a>

                <sl-dropdown>
                  <sl-icon-button
                    slot="trigger"
                    name="three-dots-vertical"
                    label="More"
                    style="font-size: 1rem"
                  ></sl-icon-button>

                  <ul role="menu">
                    <li
                      class="px-4 py-2 text-danger hover:bg-danger hover:text-white cursor-pointer"
                      role="menuitem"
                      @click=${(e: any) => {
                        // Close dropdown before deleting template
                        e.target.closest("sl-dropdown").hide();

                        this.deleteTemplate(t);
                      }}
                    >
                      ${msg("Delete")}
                    </li>
                  </ul>
                </sl-dropdown>
              </header>

              <div class="px-3 pb-3 flex justify-between items-end">
                <div class="grid gap-2 text-xs leading-none">
                  <div class="overflow-hidden">
                    <sl-tooltip content=${t.config.seeds.join(", ")}>
                      <div
                        class="font-mono whitespace-nowrap truncate text-0-500"
                      >
                        <span class="underline decoration-dashed"
                          >${t.config.seeds.join(", ")}</span
                        >
                      </div>
                    </sl-tooltip>
                  </div>
                  <div class="font-mono text-purple-500">
                    ${t.crawlCount === 1
                      ? msg(str`${t.crawlCount} crawl`)
                      : msg(
                          str`${(t.crawlCount || 0).toLocaleString()} crawls`
                        )}
                  </div>
                  <div>
                    <sl-tooltip content=${msg("Last crawl time")}>
                      <span>
                        ${t.crawlCount
                          ? html`<sl-icon
                                class="inline-block align-middle mr-1 text-purple-400"
                                name="check-circle-fill"
                              ></sl-icon
                              ><sl-format-date
                                class="inline-block align-middle text-0-600"
                                date=${`${t.lastCrawlTime}Z` /** Z for UTC */}
                                month="2-digit"
                                day="2-digit"
                                year="2-digit"
                                hour="numeric"
                                minute="numeric"
                                time-zone=${this.timeZone}
                              ></sl-format-date>`
                          : html`
                              <sl-icon
                                class="inline-block align-middle mr-1 text-0-400"
                                name="slash-circle"
                              ></sl-icon
                              ><span
                                class="inline-block align-middle text-0-400"
                                >${msg("No crawls")}</span
                              >
                            `}
                      </span>
                    </sl-tooltip>
                  </div>
                  <div>
                    ${t.schedule
                      ? html`
                          <sl-tooltip content=${msg("Next scheduled crawl")}>
                            <span>
                              <sl-icon
                                class="inline-block align-middle mr-1"
                                name="clock-history"
                              ></sl-icon
                              ><sl-format-date
                                class="inline-block align-middle text-0-600"
                                date="${cronParser
                                  .parseExpression(t.schedule, {
                                    utc: true,
                                  })
                                  .next()
                                  .toString()}"
                                month="2-digit"
                                day="2-digit"
                                year="2-digit"
                                hour="numeric"
                                minute="numeric"
                                time-zone=${this.timeZone}
                              ></sl-format-date>
                            </span>
                          </sl-tooltip>
                        `
                      : html`<sl-icon
                            class="inline-block align-middle mr-1 text-0-400"
                            name="slash-circle"
                          ></sl-icon
                          ><span class="inline-block align-middle text-0-400"
                            >${msg("No schedule")}</span
                          >`}
                  </div>
                </div>
                <div>
                  <button
                    class="text-xs border rounded-sm px-2 h-7 ${this
                      .runningCrawlsMap[t.id]
                      ? "bg-purple-50"
                      : "bg-white"} border-purple-200 hover:border-purple-500 text-purple-600 transition-colors"
                    @click=${() =>
                      this.runningCrawlsMap[t.id]
                        ? this.navTo(
                            `/archives/${this.archiveId}/crawls/${
                              this.runningCrawlsMap[t.id]
                            }`
                          )
                        : this.runNow(t)}
                  >
                    <span class="whitespace-nowrap">
                      ${this.runningCrawlsMap[t.id]
                        ? msg("View crawl")
                        : msg("Run now")}
                    </span>
                  </button>
                </div>
              </div>
            </div>`
        )}
      </div>
    `;
  }

  /**
   * Fetch crawl templates and record running crawls
   * associated with the crawl templates
   **/
  private async getCrawlTemplates(): Promise<CrawlTemplate[]> {
    type CrawlConfig = Omit<CrawlTemplate, "config"> & {
      config: Omit<CrawlTemplate["config"], "seeds"> & {
        seeds: (string | { url: string })[];
      };
    };

    const data: { crawlConfigs: CrawlConfig[] } = await this.apiFetch(
      `/archives/${this.archiveId}/crawlconfigs`,
      this.authState!
    );

    const crawlConfigs: CrawlTemplate[] = [];
    const runningCrawlsMap: RunningCrawlsMap = {};

    data.crawlConfigs.forEach(({ config, ...configMeta }) => {
      crawlConfigs.push({
        ...configMeta,
        config: {
          ...config,
          // Flatten seeds into array of URL strings
          seeds: config.seeds.map((seed) =>
            typeof seed === "string" ? seed : seed.url
          ),
        },
      });

      if (configMeta.currCrawlId) {
        runningCrawlsMap[configMeta.id] = configMeta.currCrawlId;
      }
    });

    this.runningCrawlsMap = runningCrawlsMap;

    return crawlConfigs;
  }

  private async deleteTemplate(template: CrawlTemplate): Promise<void> {
    try {
      await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/${template.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      this.notify({
        message: msg(str`Deleted <strong>${template.name}</strong>.`),
        type: "success",
        icon: "check2-circle",
      });

      this.crawlTemplates = this.crawlTemplates!.filter(
        (t) => t.id !== template.id
      );
    } catch {
      this.notify({
        message: msg("Sorry, couldn't delete crawl template at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async runNow(template: CrawlTemplate): Promise<void> {
    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/crawlconfigs/${template.id}/run`,
        this.authState!,
        {
          method: "POST",
        }
      );

      const crawlId = data.started;

      this.runningCrawlsMap = {
        ...this.runningCrawlsMap,
        [template.id]: crawlId,
      };

      this.notify({
        message: msg(
          str`Started crawl from <strong>${template.name}</strong>. <br /><a class="underline hover:no-underline" href="/archives/${this.archiveId}/crawls/${data.run_now_job}">View crawl</a>`
        ),
        type: "success",
        icon: "check2-circle",
        duration: 10000,
      });
    } catch {
      this.notify({
        message: msg("Sorry, couldn't run crawl at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
}

customElements.define("btrix-crawl-templates-list", CrawlTemplatesList);
