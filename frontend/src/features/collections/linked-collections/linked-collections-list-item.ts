import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html } from "lit";
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

  @property({ type: Boolean })
  removable?: boolean;

  @property({ type: Boolean })
  loading = false;

  render() {
    const item = this.item;

    if (!item) return;

    const actual = isActualCollection(item);

    const content = [
      html`<div class="flex-1 truncate p-1.5 leading-none">${item.name}</div>`,
    ];

    if (actual) {
      content.push(
        html`<div class="flex-none last:mr-1.5">
          <btrix-badge pill variant="cyan"
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
      content.push(
        html`<div class="flex-none">
          <sl-tooltip placement="right" content=${msg("Remove")}>
            <sl-icon-button
              name="x-lg"
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
            ></sl-icon-button>
          </sl-tooltip>
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
