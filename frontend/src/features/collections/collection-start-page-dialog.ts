import { localized, msg } from "@lit/localize";
import { html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";

@localized()
@customElement("btrix-collection-start-page-dialog")
export class CollectionStartPageDialog extends BtrixElement {
  @property({ type: String })
  collectionId?: string;

  @property({ type: Boolean })
  open = false;

  @state()
  private showContent = false;

  render() {
    return html`
      <btrix-dialog
        .label=${msg("Select Start Page")}
        .open=${this.open}
        class="[--width:40rem]"
        @sl-show=${() => (this.showContent = true)}
        @sl-after-hide=${() => (this.showContent = false)}
      >
        ${this.showContent
          ? html`<btrix-select-collection-start-page
              .collectionId=${this.collectionId}
            ></btrix-select-collection-start-page>`
          : nothing}
      </btrix-dialog>
    `;
  }
}
