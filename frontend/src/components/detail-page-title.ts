import { localized } from "@lit/localize";
import { css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { type ArchivedItem, type Workflow } from "@/types/crawler";
import { formatNumber } from "@/utils/localization";
import { pluralOf } from "@/utils/pluralize";

enum TitleSource {
  Name,
  ID,
  FirstSeed,
}

type Item = Pick<
  ArchivedItem & Workflow,
  "name" | "firstSeed" | "seedCount" | "id"
>;

@localized()
@customElement("btrix-detail-page-title")
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

    return html`<span class="truncate">${item.firstSeed}</span>${remainder
        ? html` <span class="whitespace-nowrap text-neutral-500"
            >+${formatNumber(remainder)} ${pluralOf("URLs", remainder)}</span
          >`
        : nothing}`;
  }

  render() {
    if (!this.item)
      return html`<sl-skeleton class="inline-block h-8 w-60"></sl-skeleton>`;

    return html`<sl-tooltip
      content="${this.primaryTitle(this.item).title}"
      hoist
    >
      <h1 class="flex min-w-32 text-xl font-semibold leading-8">
        ${this.renderTitle(this.item)}
      </h1>
    </sl-tooltip>`;
  }
}
