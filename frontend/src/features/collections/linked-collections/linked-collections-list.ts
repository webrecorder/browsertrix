import { localized, msg } from "@lit/localize";
import { html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { Collection } from "@/types/collection";
import { pluralOf } from "@/utils/pluralize";

@customElement("btrix-linked-collections-list")
@localized()
export class LinkedCollectionsList extends TailwindElement {
  @property({ type: Array })
  collections: Partial<Collection>[] = [];

  @property({ type: String })
  baseUrl?: string;

  render() {
    if (!this.collections.length) {
      return;
    }

    return html`<ul class="divide-y rounded border">
      ${this.collections.map(
        (col) =>
          html`<li class="flex items-center">
            <div class="flex-1 p-1.5 leading-none">${col.name}</div>
            ${col.crawlCount !== undefined
              ? html`
                  <div class="flex-none">
                    <btrix-badge pill variant="cyan"
                      >${col.crawlCount}
                      ${pluralOf("items", col.crawlCount)}</btrix-badge
                    >
                  </div>
                `
              : nothing}
            ${when(
              this.baseUrl,
              (baseUrl) =>
                html`<div class="flex-none">
                  <sl-tooltip
                    placement="right"
                    content=${msg("Open in New Tab")}
                  >
                    <sl-icon-button
                      name="arrow-up-right"
                      href="${baseUrl}/${col.id}"
                      target="_blank"
                    >
                    </sl-icon-button>
                  </sl-tooltip>
                </div>`,
            )}
          </li>`,
      )}
    </ul>`;
  }
}
