import { localized, msg, str } from "@lit/localize";
import { css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import { type CrawlState } from "@/types/crawlState";
import localize from "@/utils/localize";
import { pluralOf } from "@/utils/pluralize";

enum TitleSource {
  Name,
  ID,
  FirstSeed,
}

type Item = {
  name: string;
  id: string;
  firstSeed: string;
  seedCount: number;
  type?: "crawl" | "upload";
  finished?: string | undefined;
  state?: CrawlState;
};

@customElement("btrix-detail-page-title")
@localized()
export class DetailPageTitle extends TailwindElement {
  @property({ type: Object })
  item: Item | undefined;

  static styles = css`
    :host {
      display: contents;
    }

    sl-tooltip::part(body) {
      word-break: break-all;
      max-width: min(var(--max-width), calc(100vw - 0.5rem));
    }
  `;

  private primaryTitle(item: Item): {
    title: string;
    source: TitleSource;
  } {
    if (item.name) return { title: item.name, source: TitleSource.Name };
    if (!item.firstSeed || !item.seedCount)
      return { title: item.id, source: TitleSource.ID };
    return { title: item.firstSeed, source: TitleSource.FirstSeed };
  }

  private renderTitle(item: Item) {
    const { title, source } = this.primaryTitle(item);

    if (source !== TitleSource.FirstSeed)
      return html`<span class="truncate">${title}</span>`;

    const remainder = item.seedCount - 1;

    return html`<span class="max-w-[30ch] truncate">${item.firstSeed}</span
      >${remainder
        ? html` <span class="whitespace-nowrap text-neutral-500"
            >+${localize.number(remainder)} ${pluralOf("URLs", remainder)}</span
          >`
        : nothing}`;
  }

  private renderIcon() {
    if (!this.item?.state) return;

    const crawlStatus = CrawlStatus.getContent(this.item.state, this.item.type);

    let icon = html`<sl-tooltip
      content=${msg(str`Crawl: ${crawlStatus.label}`)}
    >
      <sl-icon
        name="gear-wide-connected"
        style="color: ${crawlStatus.cssColor}"
      ></sl-icon>
    </sl-tooltip>`;

    if (this.item.type === "upload") {
      icon = html`<sl-tooltip content=${msg(str`Upload: ${crawlStatus.label}`)}>
        <sl-icon name="upload" style="color: ${crawlStatus.cssColor}"></sl-icon>
      </sl-tooltip>`;
    }

    return html`
      <div class="flex size-8 items-center justify-center text-neutral-500">
        ${icon}
      </div>
    `;
  }

  render() {
    if (!this.item)
      return html`<sl-skeleton class="inline-block h-8 w-60"></sl-skeleton>`;

    return html`
      <h1
        class="flex min-w-32 items-center gap-2 text-xl font-semibold leading-8"
      >
        ${this.renderIcon()}
        <sl-tooltip content="${this.primaryTitle(this.item).title}" hoist>
          ${this.renderTitle(this.item)}
        </sl-tooltip>
      </h1>
    `;
  }
}
