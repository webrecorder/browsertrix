import { localized } from "@lit/localize";
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { type PublicCollection } from "@/types/collection";

@customElement("btrix-collections-grid-with-edit-dialog")
@localized()
export class CollectionsGridWithEditDialog extends BtrixElement {
  @property({ type: Array })
  collections?: PublicCollection[];

  @state()
  collectionBeingEdited: string | null = null;

  @property({ type: String })
  collectionRefreshing: string | null = null;

  @property({ type: Boolean })
  showVisibility = false;

  render() {
    const showActions = !this.navigate.isPublicPage && this.appState.isCrawler;
    return html`
      <btrix-collections-grid
        slug=${this.orgSlugState || ""}
        .collections=${this.collections}
        .collectionRefreshing=${this.collectionRefreshing}
        ?showVisibility=${this.showVisibility}
        @btrix-edit-collection=${(e: CustomEvent<string>) => {
          this.collectionBeingEdited = e.detail;
        }}
      >
        <slot name="empty-actions" slot="empty-actions"></slot>
        <slot name="pagination" slot="pagination"></slot>
      </btrix-collections-grid>
      ${when(
        showActions,
        () =>
          html`<btrix-collection-edit-dialog
            .collectionId=${this.collectionBeingEdited ?? undefined}
            ?open=${!!this.collectionBeingEdited}
            @sl-after-hide=${() => {
              this.collectionBeingEdited = null;
            }}
          ></btrix-collection-edit-dialog>`,
      )}
    `;
  }
}
