import { localized, msg } from "@lit/localize";
import { html, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { type CollectionSnapshotPreview } from "../collection-snapshot-preview";
import type { SelectSnapshotDetail } from "../select-collection-start-page";

import { BtrixElement } from "@/classes/BtrixElement";
import {
  type Collection,
  type CollectionThumbnailSource,
} from "@/types/collection";

@customElement("btrix-collection-thumbnail-select")
@localized()
export class CollectionThumbnailSelect extends BtrixElement {
  @property({ type: Object })
  collection?: Collection;

  @property({ type: Boolean })
  replayLoaded = false;

  @state()
  selectedSnapshot: CollectionThumbnailSource | null = null;

  @query("#thumbnailPreview")
  public readonly thumbnailPreview?: CollectionSnapshotPreview | null;

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("collection")) {
      this.selectedSnapshot = this.collection?.thumbnailSource ?? null;
    }
  }

  render() {
    return html`
      <div class="grid grid-cols-1 gap-5 lg:grid-cols-4">
        <div class="col-span-1">
          <h3 class="form-label">${msg("Preview")}</h3>
          ${this.renderPreview()}
        </div>
        <div class="col-span-1 lg:col-span-3">${this.renderForm()}</div>
      </div>
    `;
  }

  private renderPreview() {
    const replaySource = `/api/orgs/${this.orgId}/collections/${this.collection!.id}/replay.json`;
    // TODO Get query from replay-web-page embed
    const query = queryString.stringify({
      source: replaySource,
      customColl: this.collection!.id,
      embed: "default",
      noCache: 1,
      noSandbox: 1,
    });

    return html`
      <div
        class="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border bg-slate-50"
      >
        <btrix-collection-snapshot-preview
          class="contents"
          id="thumbnailPreview"
          collectionId=${this.collection!.id || ""}
          view="url"
          replaySrc=${`/replay/?${query}#view=pages`}
          .snapshot=${this.selectedSnapshot}
        >
        </btrix-collection-snapshot-preview>

        ${when(
          !this.replayLoaded,
          () => html`
            <div
              class="absolute inset-0 flex items-center justify-center text-2xl"
            >
              <sl-spinner></sl-spinner>
            </div>
          `,
        )}
      </div>
    `;
  }

  private renderForm() {
    return html`
      <section>
        <btrix-select-collection-start-page
          .collection=${this.collection}
          .collectionId=${this.collection?.id}
          @btrix-select=${async (e: CustomEvent<SelectSnapshotDetail>) => {
            this.dispatchEvent(
              new CustomEvent("btrix-change", {
                bubbles: true,
              }),
            );
            if (!e.detail.item) return;
            const { url, ts, pageId } = e.detail.item;
            this.selectedSnapshot = { url, urlTs: ts, urlPageId: pageId };
          }}
        ></btrix-select-collection-start-page>
      </section>
    `;
  }
}
