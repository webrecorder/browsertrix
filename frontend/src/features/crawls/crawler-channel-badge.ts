import { consume } from "@lit/context";
import { localized } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { TailwindElement } from "@/classes/TailwindElement";
import {
  orgCrawlerChannelsContext,
  type OrgCrawlerChannelsContext,
} from "@/context/org-crawler-channels";
import { CrawlerChannelImage } from "@/types/crawler";

@customElement("btrix-crawler-channel-badge")
@localized()
export class CrawlerChannelBadge extends TailwindElement {
  @consume({ context: orgCrawlerChannelsContext, subscribe: true })
  private readonly crawlerChannels?: OrgCrawlerChannelsContext;

  @property({ type: String })
  channelId?: CrawlerChannelImage | AnyString;

  render() {
    if (!this.channelId || !this.crawlerChannels) return;

    const crawlerChannel = this.crawlerChannels.find(
      ({ id }) => id === this.channelId,
    );

    return html`<btrix-popover
      content=${ifDefined(crawlerChannel?.image)}
      ?disabled=${!crawlerChannel?.image}
      hoist
    >
      <btrix-badge
        variant=${this.channelId === CrawlerChannelImage.Default
          ? "neutral"
          : "blue"}
        class="font-monostyle"
      >
        <sl-icon name="boxes" class="mr-1.5"></sl-icon>
        <span class="capitalize">${this.channelId}</span>
      </btrix-badge>
    </btrix-popover>`;
  }
}
