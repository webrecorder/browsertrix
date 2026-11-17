import { localized, msg } from "@lit/localize";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import { type CollectionsChangeEvent } from "@/features/collections/collections-add";
import { pluralOfAddItems } from "@/plurals/add-items";
import type { ListArchivedItem } from "@/types/crawler";
import { isNotEqual } from "@/utils/is-not-equal";

import "@/features/collections/collections-add";

export type ItemsAddEvent = CustomEvent<{
  itemIds: string[] | null;
}>;

/**
 * @fires btrix-cancel
 * @fires btrix-items-added
 */
@customElement("btrix-bulk-collection-items-dialog")
@localized()
export class BulkCollectionItemsDialog extends BtrixElement {
  @property({ type: Array, hasChanged: isNotEqual })
  items?: ListArchivedItem[];

  @property({ type: Boolean })
  open = false;

  @property({ type: String, useDefault: true })
  collectionId?: string;

  @query("btrix-dialog")
  readonly dialog?: Dialog | null;

  private initialCollectionId?: string | null;

  protected willUpdate(changedProperties: PropertyValues): void {
    if (
      changedProperties.has("collectionId") &&
      this.initialCollectionId === undefined
    ) {
      this.initialCollectionId = this.collectionId ?? null;
    }
  }

  render() {
    return html`<btrix-dialog
      class="[--width:40rem]"
      .label=${msg("Add Archived Items to Collection")}
      .open=${this.open}
      @sl-after-hide=${() => {
        this.collectionId = this.initialCollectionId ?? undefined;
      }}
    >
      ${when(this.items, this.renderContent)}
    </btrix-dialog>`;
  }

  private readonly renderContent = (items: ListArchivedItem[]) => {
    const inProgress = false; // TODO

    return html`<div class="min-h-48">
        <btrix-collections-add
          label=${msg("Collection")}
          limit=${1}
          .collectionIds=${this.collectionId ? [this.collectionId] : []}
          @collections-change=${(e: CollectionsChangeEvent) => {
            this.collectionId = e.detail.collections[0];
          }}
        ></btrix-collections-add>
        ${this.collectionId
          ? nothing
          : html`<div class="mt-2 rounded-lg border p-3 text-neutral-500">
              <p class="text-center">${msg("No collections selected.")}</p>
            </div>`}
      </div>

      <div slot="footer" class="flex justify-between">
        <sl-button
          size="small"
          .autofocus=${true}
          @click=${() => {
            void this.dialog?.hide();

            this.dispatchEvent(new CustomEvent("btrix-cancel"));
          }}
          >${msg("Cancel")}</sl-button
        >
        <sl-button
          size="small"
          variant="primary"
          ?disabled=${inProgress}
          ?loading=${inProgress}
          @click=${() => {
            this.dispatchEvent(
              new CustomEvent<ItemsAddEvent["detail"]>("btrix-items-added"),
            );
          }}
        >
          <sl-icon name="plus-lg" slot="prefix"></sl-icon>
          ${pluralOfAddItems(items.length)}
        </sl-button>
      </div>`;
  };
}
