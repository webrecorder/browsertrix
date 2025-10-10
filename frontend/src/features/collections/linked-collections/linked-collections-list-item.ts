import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

import type {
  BtrixRemoveLinkedCollectionEvent,
  CollectionLikeItem,
} from "./types";
import { isActualCollection } from "./utils";

import { TailwindElement } from "@/classes/TailwindElement";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

@customElement("btrix-linked-collections-list-item")
@localized()
export class LinkedCollectionsListItem extends TailwindElement {
  @property({ type: Object })
  item?: CollectionLikeItem;

  @property({ type: String })
  baseUrl?: string;

  @property({ type: String })
  dedupeId?: string;

  @property({ type: Boolean })
  removable?: boolean;

  @property({ type: Boolean })
  loading = false;

  render() {
    const item = this.item;

    if (!item) return;

    const actual = isActualCollection(item);
    const dedupeEnabled =
      item.id === this.dedupeId && actual && item.hasDedupIndex;

    const content = [
      html`<div
        class="inline-flex flex-1 items-center gap-2 p-1.5 leading-none"
      >
        <div class="w-0 flex-1 truncate">${item.name}</div>
        ${dedupeEnabled
          ? html`<btrix-badge variant="primary">
              ${msg("Dedupe Source")}
            </btrix-badge>`
          : nothing}
      </div>`,
    ];

    if (actual) {
      content.push(
        html`<div class="flex-none last:mr-1.5">
          <btrix-badge variant="cyan"
            >${item.crawlCount}
            ${pluralOf("items", item.crawlCount)}</btrix-badge
          >
        </div>`,
      );
    }

    if (this.baseUrl) {
      content.push(
        html`<div class="flex-none">
          <sl-tooltip
            placement=${this.removable ? "left" : "right"}
            content=${msg("Open in New Tab")}
          >
            <sl-icon-button
              name="arrow-up-right"
              href="${this.baseUrl}/${item.id}"
              target="_blank"
            >
            </sl-icon-button>
          </sl-tooltip>
        </div>`,
      );
    }

    if (this.removable) {
      const button = html`<sl-icon-button
        name="x-lg"
        ?disabled=${dedupeEnabled}
        @click=${() =>
          this.dispatchEvent(
            new CustomEvent<BtrixRemoveLinkedCollectionEvent["detail"]>(
              "btrix-remove",
              {
                detail: {
                  item: item,
                },
                bubbles: true,
                composed: true,
              },
            ),
          )}
      ></sl-icon-button>`;

      content.push(
        html`<div class="flex-none">
          ${dedupeEnabled
            ? html`<btrix-popover
                placement="right"
                content=${msg(
                  "This collection cannot be removed because it is being used for deduplication. Either disable deduplication or choose another deduplicating collection to remove this collection.",
                )}
              >
                ${button}
              </btrix-popover>`
            : html`<sl-tooltip placement="right" content=${msg("Remove")}>
                ${button}
              </sl-tooltip>`}
          <btrix-popover content=${msg("Collection used for deduplicating")}>
          </btrix-popover>
        </div>`,
      );
    }

    return html`<li part="base" aria-busy="${this.loading}">
      <div
        class=${clsx(
          tw`flex min-h-8 items-center transition-opacity delay-75`,
          item.name ? tw`opacity-100` : tw`opacity-0`,
        )}
      >
        ${content}
      </div>
    </li>`;
  }
}
