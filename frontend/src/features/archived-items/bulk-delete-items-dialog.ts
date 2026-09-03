import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { type GridColumn } from "@/components/ui/data-grid/types";
import type { Dialog } from "@/components/ui/dialog";
import { pluralOfItems } from "@/plurals/items";
import { pluralOfPages } from "@/plurals/pages";
import { pluralOfSkippingItems } from "@/plurals/skipping-items";
import { deleteConfirmation } from "@/strings/ui";
import type { ListArchivedItem } from "@/types/crawler";
import { pathForArchivedItem } from "@/utils/archived-items/pathForArchivedItem";
import { renderName } from "@/utils/crawler";
import { isNotEqual } from "@/utils/is-not-equal";
import { tw } from "@/utils/tailwind";

/**
 * @fires btrix-cancel
 * @fires btrix-confirm
 */
@customElement("btrix-bulk-delete-items-dialog")
@localized()
export class BulkDeleteItemsDialog extends BtrixElement {
  @property({ type: Array, hasChanged: isNotEqual })
  items?: ListArchivedItem[];

  @property({ type: Boolean })
  open = false;

  @query("btrix-dialog")
  readonly dialog?: Dialog | null;

  private readonly columns = [
    {
      field: "id",
      label: html`<span class="sr-only">${msg("Link")}</span>`,
      renderCell: ({ item }) =>
        html`<sl-tooltip
          content=${msg("Open in New Tab")}
          placement="left"
          hoist
        >
          <sl-icon-button
            class="text-sm"
            name="arrow-up-right"
            href="${this.navigate.orgBasePath}/${pathForArchivedItem(item)}"
            target="_blank"
          ></sl-icon-button>
        </sl-tooltip>`,
      renderCellClasses: () => tw`[--btrix-table-cell-padding:0]`,
      width: `min-content`,
    },
    {
      field: "name",
      label: msg("Name"),
      renderCell: ({ item }) => renderName(item),
      width: `minmax(var(--btrix-name-max-width), 1fr)`,
    },
    {
      field: "fileSize",
      label: msg("Size"),
      renderCell: ({ item }) => this.localize.bytes(item.fileSize || 0),
      width: `minmax(max-content, 1fr)`,
    },
    {
      field: "pageCount",
      label: msg("Pages"),
      renderCell: ({ item }) => pluralOfPages(item.pageCount || 0),
      width: `minmax(max-content, 1fr)`,
    },
    {
      field: "collectionIds",
      label: msg("In Collections"),
      renderCell: ({ item }) => this.localize.number(item.collectionIds.length),
      renderCellClasses: ({ item }) =>
        item.collectionIds.length > 0 && tw`bg-warning-50`,
      width: `minmax(max-content, 1fr)`,
    },
  ] as const satisfies GridColumn<ListArchivedItem>[];

  private readonly colsWithDependents = [
    ...this.columns.slice(0, 2),
    {
      field: "requiredByCrawls",
      label: msg("Dependents"),
      renderCell: ({ item }) =>
        this.localize.number(item.requiredByCrawls.length),
      width: `minmax(max-content, 1fr)`,
    },
  ] as const satisfies GridColumn<ListArchivedItem>[];

  render() {
    return html`<btrix-dialog
      class="[--width:36rem]"
      .label=${msg("Delete Archived Items?")}
      .open=${this.open}
    >
      ${when(this.items, this.renderContent)}
    </btrix-dialog>`;
  }

  private readonly renderContent = (items: ListArchivedItem[]) => {
    const hasDependents = true;
    const noDependents = false;
    const grouped = Map.groupBy(items, (item) =>
      item.requiredByCrawls.length ? hasDependents : noDependents,
    );
    const deleteable = grouped.get(noDependents);
    const notDeleteable = grouped.get(hasDependents);

    return html`<div class="flex flex-col gap-3">
        ${when(
          deleteable,
          (items) =>
            html`<div>
              <p class="max-w-prose text-pretty">
                ${deleteConfirmation(pluralOfItems(items.length))}
              </p>
              <btrix-data-grid
                class="part-[body]:text-xs"
                .columns=${this.columns}
                .items=${items}
              ></btrix-data-grid>
            </div>`,
        )}
        ${when(notDeleteable, (items) =>
          deleteable
            ? html`<btrix-details>
                <span slot="title">
                  <sl-icon
                    class="mr-0.5 align-[-.175em]"
                    name="exclamation-triangle"
                  ></sl-icon>
                  ${pluralOfSkippingItems(items.length)}
                </span>

                <div class="mt-2">
                  ${this.renderItemsWithDependents(items, true)}
                </div>
              </btrix-details>`
            : this.renderItemsWithDependents(items),
        )}
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
          variant="danger"
          ?disabled=${!deleteable}
          @click=${() => {
            this.dispatchEvent(new CustomEvent("btrix-confirm"));
          }}
        >
          <sl-icon name="trash3" slot="prefix"></sl-icon>
          ${msg("Delete Items")}
        </sl-button>
      </div>`;
  };

  private readonly renderItemsWithDependents = (
    items: ListArchivedItem[],
    hasDeleteable = false,
  ) => {
    return html` <p class="max-w-prose text-pretty">
        ${hasDeleteable
          ? msg(
              "The following items will not be deleted because they are required by other items.",
            )
          : msg(
              "The following items cannot be deleted they are required by other items.",
            )}
        ${msg("Each item must be deleted individually.")}
      </p>
      <btrix-data-grid
        class="part-[body]:text-xs"
        .columns=${this.colsWithDependents}
        .items=${items}
      ></btrix-data-grid>`;
  };
}
