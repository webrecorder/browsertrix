import { LitElement, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";

function updateTitle(content: string) {
  let title = document.head.querySelector<HTMLTitleElement>("title");

  if (!title) {
    title = document.createElement("title");
    document.head.appendChild(title);
  }

  title.innerHTML = content;
}

/**
 * Updates user's browser title bar
 */
@customElement("btrix-title")
export class DocumentTitle extends LitElement {
  @property({ type: String })
  title = "";

  disconnectedCallback(): void {
    // Reset back to default title
    updateTitle("Browsertrix");

    super.disconnectedCallback();
  }

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("title") && this.title) {
      updateTitle(this.title);
    }
  }
}
