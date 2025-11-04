import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { type SlSelect } from "@shoelace-style/shoelace";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import capitalize from "lodash/fp/capitalize";

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

type CrawlerChannelsAPIResponse = {
  channels: CrawlerChannel[];
};

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
 * @fires on-update
 */
@customElement("btrix-select-crawler")
@localized()
export class SelectCrawler extends LiteElement {
  @property({ type: String })
  size?: SlSelect["size"];

  @property({ type: String })
  crawlerChannel?: CrawlerChannel["id"];

  @state()
  private selectedCrawler?: CrawlerChannel;

  private get crawlerChannels() {
    return this.crawlerChannelsTask.value;
  }

  private readonly crawlerChannelsTask = new Task(this, {
    task: async (_args, { signal }) => {
      const channels = await this.getCrawlerChannels(signal);
      void this.updateSelectedCrawlerChannel(channels);

      return channels;
    },
    args: () => [] as const,
  });

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("crawlerChannel") && this.crawlerChannels) {
      void this.updateSelectedCrawlerChannel(this.crawlerChannels);
    }
  }

  render() {
    if (this.crawlerChannels && this.crawlerChannels.length < 2) {
      return html``;
    }

    return html`
      <sl-select
        name="crawlerChannel"
        label=${msg("Crawler Release Channel")}
        value=${this.selectedCrawler?.id || ""}
        placeholder=${msg("Latest")}
        size=${ifDefined(this.size)}
        hoist
        @sl-change=${this.onChange}
        @sl-hide=${this.stopProp}
        @sl-after-hide=${this.stopProp}
        ?disabled=${!this.crawlerChannels}
      >
        ${this.crawlerChannels?.map(
          (crawler) =>
            html` <sl-option value=${crawler.id}>
              ${capitalize(crawler.id)}
            </sl-option>`,
        )}
        <div slot="help-text">
          ${msg("Version:")}
          ${this.selectedCrawler
            ? html`
                <span class="font-monospace"
                  >${this.selectedCrawler.image}</span
                >
              `
            : nothing}
        </div>
      </sl-select>
    `;
  }

  private onChange(e: Event) {
    this.stopProp(e);

    this.selectedCrawler = this.crawlerChannels?.find(
      ({ id }) => id === (e.target as SlSelect).value,
    );

    this.dispatchEvent(
      new CustomEvent<SelectCrawlerChangeDetail>("on-change", {
        detail: {
          value: this.selectedCrawler?.id,
        },
      }),
    );
  }

  private async updateSelectedCrawlerChannel(channels: CrawlerChannel[]) {
    if (this.crawlerChannel && !this.selectedCrawler) {
      this.selectedCrawler = channels.find(
        ({ id }) => id === this.crawlerChannel,
      );
    }

    if (!this.selectedCrawler) {
      this.crawlerChannel = CrawlerChannelImage.Default;
      this.dispatchEvent(
        new CustomEvent("on-change", {
          detail: {
            value: CrawlerChannelImage.Default,
          },
        }),
      );
      this.selectedCrawler = channels.find(
        ({ id }) => id === this.crawlerChannel,
      );
    }

    await this.updateComplete;

    this.dispatchEvent(
      new CustomEvent<SelectCrawlerUpdateDetail>("on-update", {
        detail: {
          show: channels.length > 1,
        },
      }),
    );
  }

  private async getCrawlerChannels(
    signal: AbortSignal,
  ): Promise<CrawlerChannel[]> {
    const data: CrawlerChannelsAPIResponse =
      await this.apiFetch<CrawlerChannelsAPIResponse>(
        `/orgs/${this.orgId}/crawlconfigs/crawler-channels`,
        { signal },
      );

    return data.channels;
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
