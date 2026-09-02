import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { type GridColumn } from "@/components/ui/data-grid/types";
import type { Dialog } from "@/components/ui/dialog";
import { pluralOfItems } from "@/plurals/items";
import { deleteConfirmation } from "@/strings/ui";
import type { ListArchivedItem } from "@/types/crawler";
import { pathForArchivedItem } from "@/utils/archived-items/pathForArchivedItem";
import { renderName } from "@/utils/crawler";
import { tw } from "@/utils/tailwind";

/**
 * @fires btrix-cancel
 * @fires btrix-confirm
 */
@customElement("btrix-bulk-delete-items-dialog")
@localized()
export class BulkDeleteItemsDialog extends BtrixElement {
  @property({ type: Array })
  items?: ListArchivedItem[];

  @property({ type: Boolean })
  open = false;

  @query("btrix-dialog")
  readonly dialog?: Dialog | null;

  private readonly columns = [
    {
      field: "name",
      label: msg("Name"),
      renderCell: ({ item }) => renderName(item),
      width: `var(--btrix-name-max-width)`,
    },
    {
      field: "fileSize",
      label: msg("Size"),
      renderCell: ({ item }) =>
        item.fileSize ? this.localize.bytes(item.fileSize) : `0`,
    },
    {
      field: "collectionIds",
      label: msg("Collections"),
      renderCell: ({ item }) => this.localize.number(item.collectionIds.length),
      renderCellClasses: ({ item }) =>
        item.collectionIds.length > 0 && tw`bg-red-50`,
    },
    {
      field: "id",
      label: html`<span class="sr-only">${msg("Link")}</span>`,
      renderCell: ({ item }) =>
        html`<sl-tooltip content=${msg("Open in New Tab")} hoist>
          <sl-icon-button
            class="text-sm"
            name="arrow-up-right"
            href="${this.navigate.orgBasePath}/${pathForArchivedItem(item)}"
            target="_blank"
          ></sl-icon-button>
        </sl-tooltip>`,
      renderCellClasses: () => tw`[--btrix-table-cell-padding:0]`,
      width: `max-content`,
    },
  ] as const satisfies GridColumn<ListArchivedItem>[];

  render() {
    return html`<btrix-dialog
      class="[--width:36rem]"
      .label=${msg("Delete Archived Items?")}
      .open=${this.open}
    >
      ${when(this.items, this.renderItems)}

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
          variant="danger"
          ?disabled=${!this.items}
          @click=${() => {
            this.dispatchEvent(new CustomEvent("btrix-confirm"));
          }}
        >
          <sl-icon name="trash3" slot="prefix"></sl-icon>
          ${msg("Delete Items")}
        </sl-button>
      </div>
    </btrix-dialog>`;
  }

  private readonly renderItems = (items: ListArchivedItem[]) => {
    console.log(items);
    return html`<p>${deleteConfirmation(pluralOfItems(items.length))}</p>

      <btrix-data-grid
        class="part-[body]:text-xs"
        .columns=${this.columns}
        .items=${items}
      ></btrix-data-grid> `;
  };
}
