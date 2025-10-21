import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import type { Crawl } from "@/types/crawler";
import { renderName } from "@/utils/crawler";
import { pluralOf } from "@/utils/pluralize";

@customElement("btrix-delete-crawl-dialog")
@localized()
export class DeleteCrawlDialog extends BtrixElement {
  @property({ type: Object })
  crawl?: Crawl;

  /**
   * Include the crawl name when identifying the crawl.
   */
  @property({ type: Boolean })
  includeName = false;

  @property({ type: Boolean })
  open = false;

  @query("btrix-dialog")
  readonly dialog?: Dialog | null;

  private readonly collectionsTask = new Task(this, {
    task: async ([open, crawl], { signal }) => {
      if (!open || !crawl?.collectionIds) return;

      return (await this.getCrawl(crawl.id, signal)).collections;
    },
    args: () => [this.open, this.crawl] as const,
  });

  render() {
    const identifyingMessage = () => {
      if (!this.crawl?.finished) {
        return msg("Are you sure you want to delete this crawl?");
      }

      const finish_date = this.localize.date(this.crawl.finished);

      if (this.includeName) {
        const item_name = html`<strong class="font-semibold"
          >${renderName(this.crawl)} (${finish_date})</strong
        >`;

        return msg(html`Are you sure you want to delete ${item_name}?`);
      }

      return msg(
        str`Are you sure you want to delete the ${finish_date} crawl?`,
      );
    };

    return html`<btrix-dialog .label=${msg("Delete Crawl?")} .open=${this.open}>
      <p>
        ${identifyingMessage()}
        ${msg("All files and logs associated with this crawl will be deleted.")}
      </p>

      ${this.renderCollections()}
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
          >${msg("Delete Crawl")}</sl-button
        >
      </div>
    </btrix-dialog>`;
  }

  private renderCollections() {
    if (!this.crawl?.collectionIds.length) return;

    const count = this.crawl.collectionIds.length;

    const number_of_collections = this.localize.number(count);
    const plural_of_collections = pluralOf("collections", count);

    return html`
      <p class="my-2">
        ${msg(
          str`The archived item will be removed from ${number_of_collections} ${plural_of_collections}:`,
        )}
      </p>
      ${this.collectionsTask.render({
        pending: () => html`<sl-spinner></sl-spinner>`,
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

  private async getCrawl(id: string, signal: AbortSignal) {
    const data: Crawl = await this.api.fetch<Crawl>(
      `/orgs/all/crawls/${id}/replay.json`,
      {
        signal,
      },
    );

    return data;
  }
}
