import { consume } from "@lit/context";
import { localized, msg } from "@lit/localize";
import { type SlSelect } from "@shoelace-style/shoelace";
import { html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import capitalize from "lodash/fp/capitalize";

import {
  orgCrawlerChannelsContext,
  type OrgCrawlerChannelsContext,
} from "@/context/org-crawler-channels";
import { CrawlerChannelImage, type CrawlerChannel } from "@/pages/org/types";
import LiteElement from "@/utils/LiteElement";

type SelectCrawlerChangeDetail = {
  value: string | undefined;
};

export type SelectCrawlerChangeEvent = CustomEvent<SelectCrawlerChangeDetail>;

type SelectCrawlerUpdateDetail = {
  show: boolean;
};

export type SelectCrawlerUpdateEvent = CustomEvent<SelectCrawlerUpdateDetail>;

/**
 * Crawler channel select dropdown
 *
 * @TODO Convert to form control
 *
 * Usage example:
 * ```ts
 * <btrix-select-crawler
 *   on-change=${({value}) => selectedCrawler = value}
 * ></btrix-select-crawler>
 * ```
 *
 * @fires on-change
 */
@customElement("btrix-select-crawler")
@localized()
export class SelectCrawler extends LiteElement {
  @consume({ context: orgCrawlerChannelsContext, subscribe: true })
  private readonly crawlerChannels?: OrgCrawlerChannelsContext;

  @property({ type: String })
  size?: SlSelect["size"];

  @property({ type: String })
  crawlerChannel?: CrawlerChannel["id"];

  render() {
    const selectedCrawler = this.getSelectedChannel();

    return html`
      <sl-select
        name="crawlerChannel"
        label=${msg("Crawler Release Channel")}
        value=${selectedCrawler?.id || ""}
        placeholder=${msg("Latest")}
        size=${ifDefined(this.size)}
        hoist
        @sl-change=${this.onChange}
        @sl-hide=${this.stopProp}
        @sl-after-hide=${this.stopProp}
        ?disabled=${!this.crawlerChannels || this.crawlerChannels.length === 1}
      >
        ${this.crawlerChannels?.map(
          (crawler) =>
            html` <sl-option value=${crawler.id}>
              ${capitalize(crawler.id)}
            </sl-option>`,
        )}
        <div slot="help-text">
          ${msg("Version:")}
          ${selectedCrawler
            ? html`
                <span class="font-monospace">${selectedCrawler.image}</span>
              `
            : nothing}
        </div>
      </sl-select>
    `;
  }

  private getSelectedChannel() {
    if (!this.crawlerChannels || !this.crawlerChannel) return null;

    if (this.crawlerChannel) {
      return this.crawlerChannels.find(({ id }) => id === this.crawlerChannel);
    }

    return (
      this.crawlerChannels.find(
        ({ id }) => id === CrawlerChannelImage.Default,
      ) ?? null
    );
  }

  private onChange(e: Event) {
    this.stopProp(e);

    const selectedCrawler = this.crawlerChannels?.find(
      ({ id }) => id === (e.target as SlSelect).value,
    );

    this.dispatchEvent(
      new CustomEvent<SelectCrawlerChangeDetail>("on-change", {
        detail: {
          value: selectedCrawler?.id,
        },
      }),
    );
  }

  /**
   * Stop propgation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: Event) {
    e.stopPropagation();
  }
}
