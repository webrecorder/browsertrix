import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Dialog } from "@/components/ui/dialog";
import type { Crawl } from "@/types/crawler";

@customElement("btrix-delete-crawl-dialog")
@localized()
export class DeleteCrawlDialog extends BtrixElement {
  @property({ type: Object })
  crawl?: Crawl;

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
    return html`<btrix-dialog .label=${msg("Delete Crawl?")} .open=${this.open}>
      ${this.renderCollections()}
      <p>
        ${msg(
          "All files and logs associated with this crawl will also be deleted, and the crawl will no longer be visible in its associated workflow.",
        )}
      </p>
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

    return html`
      <p>
        ${msg(
          "The archived item will be removed from the following collections:",
        )}
      </p>
      <div class="my-2">
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
      </div>
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
