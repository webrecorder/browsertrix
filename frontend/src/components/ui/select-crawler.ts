import { html } from "lit";
import { property, state, customElement } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import type { CrawlerVersion } from "../../pages/org/types";

import LiteElement from "@/utils/LiteElement";
import capitalize from "lodash/fp/capitalize";

type CrawlerVersionsAPIResponse = {
  versions: CrawlerVersion[];
};

/**
 * Crawler version select dropdown
 *
 * Usage example:
 * ```ts
 * <btrix-select-crawler
 *   authState=${authState}
 *   orgId=${orgId}
 *   on-change=${({value}) => selectedCrawler = value}
 * ></btrix-select-crawler>
 * ```
 *
 * @event on-change
 */
@customElement("btrix-select-crawler")
@localized()
export class SelectCrawler extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  crawlerChannel?: string;

  @state()
  private selectedCrawler?: CrawlerVersion;

  @state()
  private crawlerVersions?: CrawlerVersion[];

  protected firstUpdated() {
    this.fetchCrawlerVersions();
  }

  render() {
    return html`
      <sl-select
        name="crawlerChannel-select"
        label=${msg("Crawler Release Channel")}
        value=${this.selectedCrawler?.id || ""}
        placeholder=${msg("Latest")}
        hoist
        @sl-change=${this.onChange}
        @sl-focus=${() => {
          // Refetch to keep list up to date
          this.fetchCrawlerVersions();
        }}
        @sl-hide=${this.stopProp}
        @sl-after-hide=${this.stopProp}
      >
        ${this.crawlerVersions?.map(
          (crawler) => html` <sl-option value=${crawler.id}>
            ${capitalize(crawler.id)}
          </sl-option>`
        )}
        ${this.selectedCrawler
          ? html`
              <div
                slot="help-text"
                style="font-size: smaller"
                class="text-right"
              >
                Current Version:
                <span class="font-monospace"
                  >${this.selectedCrawler.image}</span
                >
              </div>
            `
          : ``}
      </sl-select>
    `;
  }

  private onChange(e: any) {
    this.stopProp(e);

    this.selectedCrawler = this.crawlerVersions?.find(
      ({ id }) => id === e.target.value
    );

    this.dispatchEvent(
      new CustomEvent("on-change", {
        detail: {
          value: this.selectedCrawler?.id,
        },
      })
    );
  }

  /**
   * Fetch crawler versions and update internal state
   */
  private async fetchCrawlerVersions(): Promise<void> {
    try {
      const versions = await this.getCrawlerVersions();
      this.crawlerVersions = versions as CrawlerVersion[];

      if (this.crawlerChannel && !this.selectedCrawler) {
        this.selectedCrawler = this.crawlerVersions.find(
          ({ id }) => id === this.crawlerChannel
        );
      }
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve crawler versions at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCrawlerVersions(): Promise<CrawlerVersion[]> {
    const data: CrawlerVersionsAPIResponse =
      await this.apiFetch<CrawlerVersionsAPIResponse>(
        `/orgs/${this.orgId}/crawlconfigs/crawler-versions`,
        this.authState!
      );

    return data.versions;
  }

  /**
   * Stop propgation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: CustomEvent) {
    e.stopPropagation();
  }
}
