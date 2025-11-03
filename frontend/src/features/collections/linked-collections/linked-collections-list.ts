import { localized } from "@lit/localize";
import clsx from "clsx";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { until } from "lit/directives/until.js";

import type { CollectionLikeItem } from "./types";

import { TailwindElement } from "@/classes/TailwindElement";
import { tw } from "@/utils/tailwind";

@customElement("btrix-linked-collections-list")
@localized()
export class LinkedCollectionsList extends TailwindElement {
  @property({ type: Array })
  collections: (CollectionLikeItem & {
    request?: Promise<CollectionLikeItem>;
  })[] = [];

  @property({ type: String })
  baseUrl?: string;

  @property({ type: String })
  dedupeId?: string;

  @property({ type: Boolean })
  removable?: boolean;

  render() {
    if (!this.collections.length) {
      return;
    }

    return html`<ul class="rounded border">
      ${this.collections.map((item, i) => {
        const request = item.request || Promise.resolve(item);

        return html`<btrix-linked-collections-list-item
          class=${clsx(tw`contents`, i > 0 && tw`part-[base]:border-t`)}
          .item=${until(request, item)}
          baseUrl=${ifDefined(this.baseUrl)}
          ?dedupeSource=${Boolean(this.dedupeId && item.id === this.dedupeId)}
          ?removable=${this.removable}
          ?loading=${until(
            request.then(() => false),
            true,
          )}
        ></btrix-linked-collections-list-item>`;
      })}
    </ul>`;
  }
}
