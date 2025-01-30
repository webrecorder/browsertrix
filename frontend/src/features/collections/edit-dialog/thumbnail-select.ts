import { localized } from "@lit/localize";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type { SelectSnapshotDetail } from "../select-collection-start-page";

import { snapshotToSource } from "./helpers/snapshots";

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
  selectedSnapshot: CollectionThumbnailSource | null =
    this.collection?.thumbnailSource ?? null;

  protected willUpdate(changedProperties: PropertyValues<this>): void {
    if (changedProperties.has("collection")) {
      this.selectedSnapshot = this.collection?.thumbnailSource ?? null;
    }
  }

  render() {
    return html`<section>
      <btrix-select-collection-page
        mode="thumbnail"
        .collection=${this.collection}
        .collectionId=${this.collection?.id}
        .initialSelectedSnapshot=${this.selectedSnapshot
          ? {
              pageId: this.selectedSnapshot.urlPageId,
              ts: this.selectedSnapshot.urlTs,
              status: 200,
            }
          : undefined}
        @btrix-select=${async (e: CustomEvent<SelectSnapshotDetail>) => {
          this.dispatchEvent(
            new CustomEvent("btrix-change", {
              bubbles: true,
            }),
          );
          if (!e.detail.item) return;
          this.selectedSnapshot = snapshotToSource(e.detail.item);
        }}
      ></btrix-select-collection-page>
    </section>`;
  }
}
