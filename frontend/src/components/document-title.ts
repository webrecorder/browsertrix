import { LitElement, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Updates user's browser title bar
 */
@customElement("btrix-document-title")
export class DocumentTitle extends LitElement {
  @property({ type: String })
  title = "";

  disconnectedCallback(): void {
    // Reset back to default title
    document.title = "Browsertrix";

    super.disconnectedCallback();
  }

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("title") && this.title) {
      document.title = this.title;
    }
  }
}
