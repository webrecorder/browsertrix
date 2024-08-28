import { LitElement, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Updates document title
 */
@customElement("btrix-browser-title")
export class BrowserTitle extends LitElement {
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
