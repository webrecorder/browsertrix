import { localized, msg } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import {
  type CollectionNameInputChangeEvent,
  type CollectionNameInputLoadedEvent,
} from "@/features/collections/collection-name-input";
import { pluralOfAddItems } from "@/plurals/add-items";
import { CommonTab, OrgTab } from "@/routes";
import { stringFor } from "@/strings/ui";
import { type Collection } from "@/types/collection";
import type { ListArchivedItem } from "@/types/crawler";
import { isNotEqual } from "@/utils/is-not-equal";
import slugifyStrict from "@/utils/slugify";

import "@/features/collections/collection-name-input";

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

  @property({ type: String, useDefault: true })
  newCollectionName?: string;

  @state()
  private selectedCollection?: Collection;

  @query("btrix-dialog")
  readonly dialog?: Dialog | null;

  private initialCollectionId?: string | null;

  private readonly addItemsTask = new Task(this, {
    autoRun: false,
    task: async ([items, collectionId, newCollectionName], { signal }) => {
      if (!items?.length || (!collectionId && !newCollectionName)) return;

      try {
        let id = collectionId;

        if (!id && newCollectionName) {
          const data = await this.api.fetch<Collection>(
            `/orgs/${this.orgId}/collections`,
            {
              method: "POST",
              body: JSON.stringify({
                name: newCollectionName,
                slug: slugifyStrict(newCollectionName),
              }),
              signal,
            },
          );

          id = data.id;
        }

        if (id) {
          await this.api.fetch(`/orgs/${this.orgId}/collections/${id}/add`, {
            method: "POST",
            body: JSON.stringify({
              crawlIds: items.map(({ id }) => id),
            }),
            signal,
          });
        } else {
          throw new Error("collection ID required");
        }

        await this.dialog?.hide();

        this.dispatchEvent(
          new CustomEvent<AddItemsSuccessEvent["detail"]>("btrix-success", {
            detail: { collectionId: id },
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
    args: () =>
      [this.items, this.collectionId, this.newCollectionName] as const,
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
        this.resetSelection();

        // HACK Lit task doesn't support reset; run without args to reset error
        // See https://github.com/lit/lit/issues/5352
        void this.addItemsTask.run([undefined, undefined, undefined]);
      }}
    >
      ${when(this.items, this.renderContent)}
    </btrix-dialog>`;
  }

  private readonly renderContent = (items: ListArchivedItem[]) => {
    const inProgress = this.addItemsTask.status === TaskStatus.PENDING;

    return html`<div>
        <btrix-collection-name-input
          label=${msg("Collection Name")}
          collectionId=${ifDefined(this.collectionId)}
          searchByValue=${ifDefined(
            this.selectedCollection?.name ??
              this.newCollectionName ??
              undefined,
          )}
          @btrix-loaded=${(e: CollectionNameInputLoadedEvent) => {
            const { value } = e.detail;

            if (value) {
              this.selectedCollection = value;
            }
          }}
          @btrix-change=${(e: CollectionNameInputChangeEvent) => {
            const { value } = e.detail;

            if ("id" in value) {
              this.selectedCollection = value;
              this.newCollectionName = undefined;
            } else {
              this.selectedCollection = undefined;
              this.newCollectionName = value.name;
            }
          }}
          @btrix-clear=${() => {
            this.resetSelection();
          }}
        >
        </btrix-collection-name-input>

        ${when(
          this.selectedCollection,
          (col) => html`
            <btrix-details class="mt-2">
              <span slot="title">${msg("Collection Details")}</span>
              <btrix-link
                slot="summary-description"
                href="${this.navigate
                  .orgBasePath}/${OrgTab.Collections}/${CommonTab.View}/${col.id}"
                target="_blank"
              >
                ${msg("View collection")}
              </btrix-link>

              <div class="pt-2">
                <btrix-desc-list>
                  <btrix-desc-list-item label=${msg("Archived Items")}>
                    ${this.localize.number(col.crawlCount)}
                  </btrix-desc-list-item>
                  <btrix-desc-list-item label=${msg("Total Pages")}>
                    ${this.localize.number(col.pageCount)}
                  </btrix-desc-list-item>
                  <btrix-desc-list-item label=${msg("Total Size")}>
                    ${this.localize.bytes(col.totalSize)}
                  </btrix-desc-list-item>
                  ${when(
                    col.created,
                    (created) => html`
                      <btrix-desc-list-item label=${msg("Created")}>
                        ${this.localize.date(created, {
                          dateStyle: "long",
                          timeStyle: "short",
                        })}
                      </btrix-desc-list-item>
                    `,
                  )}
                  <btrix-desc-list-item label=${msg("Last Modified")}>
                    ${this.localize.date(col.modified, {
                      dateStyle: "long",
                      timeStyle: "short",
                    })}
                  </btrix-desc-list-item>
                  ${this.featureFlags.has("dedupeEnabled")
                    ? html`<btrix-desc-list-item
                        label=${msg("Used as Dedupe Source")}
                      >
                        ${col.indexState ? stringFor.yes : stringFor.no}
                      </btrix-desc-list-item>`
                    : nothing}
                </btrix-desc-list>
              </div>
            </btrix-details>
          `,
        )}
        ${when(this.newCollectionName, () => {
          const workflow_name = html`<strong class="font-medium"
            >${this.newCollectionName}</strong
          >`;
          return html`
            <div class="form-help-text">
              ${msg(
                html`A new collection named “${workflow_name}” will be created.`,
              )}
            </div>
          `;
        })}
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

  private resetSelection() {
    this.selectedCollection = undefined;
    this.newCollectionName = undefined;
  }
}
