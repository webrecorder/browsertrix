import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlChangeEvent, SlCheckbox } from "@shoelace-style/shoelace";
import { html, type PropertyValues } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import type { ArchivedItemSectionName } from "@/pages/org/archived-item-detail/archived-item-detail";
import { CommonTab, OrgTab, WorkflowTab } from "@/routes";
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

  @property({ type: Boolean })
  disabled = false;

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

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("item") && this.item) {
      this.disabled = Boolean(this.item.requiredByCrawls.length);
    }
  }

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
      <p>${msg(html`Are you sure you want to delete ${item_name}?`)}</p>

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
        <btrix-popover
          content=${msg("Please confirm impact on dependents to continue.")}
          ?disabled=${!this.disabled}
          hoist
        >
          <sl-button
            size="small"
            variant="danger"
            ?disabled=${this.disabled}
            @click=${() => {
              this.dispatchEvent(new CustomEvent("btrix-confirm"));
            }}
          >
            ${crawl ? msg("Delete Crawl") : msg("Delete Archived Item")}
          </sl-button>
        </btrix-popover>
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
      <btrix-details class="mt-2" ?open=${!this.item.requiredByCrawls.length}>
        <span slot="title">${msg("Impact on Collections")}</span>

        <p class="my-2">
          ${msg(
            str`This item will be removed from ${number_of_collections} ${plural_of_collections}:`,
          )}
        </p>
        ${this.collectionsTask.render({
          pending: () =>
            html`<btrix-linked-collections-list
              .collections=${collectionIds.map((id) => ({ id }))}
              baseUrl="${this.navigate
                .orgBasePath}/${OrgTab.Collections}/${CommonTab.View}"
            >
            </btrix-linked-collections-list>`,
          complete: (res) =>
            when(
              res,
              (collections) =>
                html`<btrix-linked-collections-list
                  .collections=${collections}
                  baseUrl="${this.navigate
                    .orgBasePath}/${OrgTab.Collections}/${CommonTab.View}"
                >
                </btrix-linked-collections-list>`,
            ),
        })}
      </btrix-details>
    `;
  }

  private renderDependents() {
    if (!this.item?.requiredByCrawls.length) return;

    const { requiredByCrawls } = this.item;
    const count = requiredByCrawls.length;

    const number_of_dependents = this.localize.number(count);
    const plural_of_dependents = pluralOf("dependents", count);

    const itemPath = `${this.navigate.orgBasePath}/${OrgTab.Workflows}/${this.item.cid}/${WorkflowTab.Crawls}/${this.item.id}`;

    return html`
      <btrix-details class="mt-2" open>
        <span slot="title">${msg("Impact on Dependents")}</span>

        <p class="my-2">
          ${msg(
            str`This item has ${number_of_dependents} ${plural_of_dependents}.`,
          )}
        </p>
        <p class="my-2 font-medium text-danger">
          ${msg(
            "Deleting this item may result in missing or incomplete content.",
          )}
        </p>
        <p class="my-2">
          ${msg(
            "To prevent permanent data loss, downloading the item first is highly recommended.",
          )}
          <btrix-link
            href="${this.navigate.orgBasePath}/${OrgTab.Workflows}/${this.item
              .cid}/${WorkflowTab.Crawls}/${this.item
              .id}#${"files" satisfies ArchivedItemSectionName}"
            @click=${() => {
              if (new URL(window.location.href).pathname === itemPath) {
                void this.dialog?.hide();
                this.dispatchEvent(new CustomEvent("btrix-cancel"));
              }
            }}
            >${msg("Go to downloads")}</btrix-link
          >
        </p>
      </btrix-details>

      <sl-checkbox
        @sl-change=${(e: SlChangeEvent) => {
          const { checked } = e.target as SlCheckbox;

          this.disabled = !checked;
        }}
        ?checked=${!this.disabled}
        >${msg(
          "I understand the impact of item deletion on dependents.",
        )}</sl-checkbox
      >
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
