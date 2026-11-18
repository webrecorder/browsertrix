import { localized, msg } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
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

export type AddItemsSuccessEvent = CustomEvent<{ collectionId: string }>;

/**
 * @fires btrix-cancel
 * @fires btrix-success
 * @fires btrix-error
 * @fires btrix-abort
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

  private readonly addItemsTask = new Task(this, {
    autoRun: false,
    task: async ([collectionId, items], { signal }) => {
      if (!collectionId || !items?.length) return;

      try {
        await this.api.fetch(
          `/orgs/${this.orgId}/collections/${collectionId}/add`,
          {
            method: "POST",
            body: JSON.stringify({
              crawlIds: items.map(({ id }) => id),
            }),
            signal,
          },
        );

        await this.dialog?.hide();

        this.dispatchEvent(
          new CustomEvent<AddItemsSuccessEvent["detail"]>("btrix-success", {
            detail: { collectionId },
          }),
        );
      } catch (err) {
        if (signal.aborted) {
          await this.dialog?.hide();

          this.dispatchEvent(new CustomEvent("btrix-abort"));
        } else {
          this.dispatchEvent(new CustomEvent("btrix-error"));

          throw err;
        }
      }
    },
    args: () => [this.collectionId, this.items] as const,
  });

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
      @sl-request-close=${() => {
        if (this.addItemsTask.status === TaskStatus.PENDING) {
          this.addItemsTask.abort();
        }
      }}
      @sl-after-hide=${() => {
        this.collectionId = this.initialCollectionId ?? undefined;

        // HACK Lit task doesn't support reset; run without args to reset error
        // See https://github.com/lit/lit/issues/5352
        void this.addItemsTask.run([undefined, undefined]);
      }}
    >
      ${when(this.items, this.renderContent)}
    </btrix-dialog>`;
  }

  private readonly renderContent = (items: ListArchivedItem[]) => {
    const inProgress = this.addItemsTask.status === TaskStatus.PENDING;

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
              <p class="text-center">${msg("No collection selected.")}</p>
            </div>`}
      </div>

      <div slot="footer" class="flex items-center justify-end gap-2">
        <sl-button
          class="mr-auto"
          size="small"
          .autofocus=${true}
          @click=${() => {
            if (this.addItemsTask.status === TaskStatus.PENDING) {
              this.addItemsTask.abort();
            } else {
              this.dispatchEvent(new CustomEvent("btrix-cancel"));
            }

            void this.dialog?.hide();
          }}
          >${msg("Cancel")}</sl-button
        >

        ${this.addItemsTask.render({
          error: () =>
            html`<p class="text-danger">
              ${msg("Something went wrong, couldn’t add items.")}
            </p>`,
        })}
        <sl-button
          size="small"
          variant="primary"
          ?disabled=${inProgress}
          ?loading=${inProgress}
          @click=${() => {
            void this.addItemsTask.run();
          }}
        >
          ${pluralOfAddItems(items.length)}
        </sl-button>
      </div>`;
  };
}
