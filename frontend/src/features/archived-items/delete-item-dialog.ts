import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import type { ArchivedItem } from "@/types/crawler";
import { isCrawl, renderName } from "@/utils/crawler";
import { pluralOf } from "@/utils/pluralize";

/**
 * Confirm deletion of an archived item, crawl associated
 * with an archived item, or crawl run.
 *
 * @slot name
 */
@customElement("btrix-delete-item-dialog")
@localized()
export class DeleteItemDialog extends BtrixElement {
  @property({ type: Object })
  item?: ArchivedItem;

  @property({ type: Boolean })
  open = false;

  @query("btrix-dialog")
  readonly dialog?: Dialog | null;

  private readonly collectionsTask = new Task(this, {
    task: async ([open, crawl], { signal }) => {
      if (!crawl?.collectionIds) return;

      if (!open) {
        return crawl.collectionIds.map((id) => ({ id }));
      }

      return (await this.getCrawl(crawl.id, signal)).collections;
    },
    args: () => [this.open, this.item] as const,
  });

  render() {
    return html`<btrix-dialog
      .label=${this.item
        ? isCrawl(this.item)
          ? msg("Delete Crawl?")
          : msg("Delete Archived Item?")
        : msg("Delete")}
      .open=${this.open}
    >
      ${this.renderContent()}
    </btrix-dialog>`;
  }

  private renderContent() {
    const item = this.item;

    if (!item) return;

    const crawl = isCrawl(item);
    const item_name = html`<slot name="name"
      ><strong class="font-semibold">${renderName(item)}</strong></slot
    >`;

    return html`
      <p>
        ${msg(html`Are you sure you want to delete ${item_name}?`)}
        ${msg("All associated files and logs will be deleted.")}
      </p>

      ${this.renderDependents()} ${this.renderCollections()}

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
          @click=${() => {
            this.dispatchEvent(new CustomEvent("btrix-confirm"));
          }}
          >${crawl
            ? msg("Delete Crawl")
            : msg("Delete Archived Item")}</sl-button
        >
      </div>
    `;
  }

  private renderCollections() {
    if (!this.item?.collectionIds.length) return;

    const { collectionIds } = this.item;
    const count = collectionIds.length;

    const number_of_collections = this.localize.number(count);
    const plural_of_collections = pluralOf("collections", count);

    return html`
      <p class="my-2">
        ${msg(
          str`The archived item will be removed from ${number_of_collections} ${plural_of_collections}:`,
        )}
      </p>
      ${this.collectionsTask.render({
        pending: () =>
          html`<btrix-linked-collections-list
            .collections=${collectionIds.map((id) => ({ id }))}
            baseUrl="${this.navigate.orgBasePath}/collections/view"
          >
          </btrix-linked-collections-list>`,
        complete: (res) =>
          when(
            res,
            (collections) =>
              html`<btrix-linked-collections-list
                .collections=${collections}
                baseUrl="${this.navigate.orgBasePath}/collections/view"
              >
              </btrix-linked-collections-list>`,
          ),
      })}
    `;
  }

  private renderDependents() {
    if (!this.item?.requiredByCrawls.length) return;

    const { requiredByCrawls } = this.item;
    const count = requiredByCrawls.length;

    const number_of_items = this.localize.number(count);
    const plural_of_items = pluralOf("items", count);

    return html`
      <p class="my-2">
        ${msg(
          str`${number_of_items} ${plural_of_items} depend on this
                    item.`,
        )}
        ${msg(
          "Deleting this item will result in incomplete replay and downloads.",
        )}
      </p>
    `;
  }

  private async getCrawl(id: string, signal: AbortSignal) {
    const data: ArchivedItem = await this.api.fetch<ArchivedItem>(
      `/orgs/${this.orgId}/crawls/${id}/replay.json`,
      {
        signal,
      },
    );

    return data;
  }
}
