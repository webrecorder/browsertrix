import { html } from "lit";
import { property, state, customElement } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";
import { when } from "lit/directives/when.js";
import orderBy from "lodash/fp/orderBy";

import type { AuthState } from "../utils/AuthService";
import LiteElement from "../utils/LiteElement";
import type { CrawlerVersion } from "../pages/org/types";

/**
 * Crawler version select dropdown
 *
 * Usage example:
 * ```ts
 * <btrix-select-crawler-version
 *   authState=${authState}
 *   orgId=${orgId}
 *   on-change=${({value}) => selectedCrawler = value}
 * ></btrix-select-crawler-version>
 * ```
 *
 * @event on-change
 */
@customElement("btrix-select-crawler-version")
@localized()
export class SelectCrawlerVersion extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  crawlerId?: string;

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
        name="crawlerid"
        label=${msg("Crawler Version")}
        value=${this.selectedCrawler?.id || ""}
        placeholder=${msg("Loading")}
        hoist
        @sl-change=${this.onChange}
        @sl-focus=${() => {
          // Refetch to keep list up to date
          this.fetchCrawlerVersions();
        }}
        @sl-hide=${this.stopProp}
        @sl-after-hide=${this.stopProp}
      >
        ${when(
          !this.crawlerVersions.length,
          () => html`<sl-spinner slot="prefix"></sl-spinner>`
        )}
        ${this.crawlerVersions?.map(
          (crawler) => html` <sl-option value=${crawler.id}>
            ${crawler.name}
          </sl-option>`
        )}
      </sl-select>
    `;
  }

  private onChange(e: any) {
    this.selectedCrawler = this.crawlerVersions?.find(
      ({ id }) => id === e.target.value
    );

    this.dispatchEvent(
      new CustomEvent("on-change", {
        detail: {
          value: this.selectedCrawler,
        },
      })
    );
  }

  /**
   * Fetch crawler versions and update internal state
   */
  private async fetchCrawlerVersions(): Promise<void> {
    try {
      const data = await this.getCrawlerVersions();

      this.crawlerVersions = orderBy(["name"])(["asc", "desc"])(
        data
      ) as CrawlerVersion[];

      if (this.crawlerId && !this.selectedCrawler) {
        this.selectedCrawler = this.crawlerVersions.find(
          ({ id }) => id === this.crawlerId
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

  private async getCrawlerVersions(): Promise<Profile[]> {
    const data: APIPaginatedList = await this.apiFetch(
      `/orgs/${this.orgId}/crawlconfigs/crawler-versions`,
      this.authState!
    );
    return data;
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
