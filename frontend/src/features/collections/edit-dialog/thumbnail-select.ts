import { localized } from "@lit/localize";
import { html, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";

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
    return html`<section>
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
    </section>`;
  }
}
