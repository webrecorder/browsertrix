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

    return html``;
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
          // Normalize seed format
          seeds: config.seeds.map((seed) =>
            typeof seed === "string"
              ? {
                  url: seed,
                }
              : seed
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
        message: msg(html`Deleted <strong>${template.name}</strong>.`),
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
          html`Started crawl from <strong>${template.name}</strong>. <br />
            <a
              class="underline hover:no-underline"
              href="/archives/${this
                .archiveId}/crawls/crawl/${data.started}#watch"
              @click=${this.navLink.bind(this)}
              >View crawl</a
            >`
        ),
        type: "success",
        icon: "check2-circle",
        duration: 8000,
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
