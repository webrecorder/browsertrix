import { localized } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

@localized()
@customElement("btrix-field-error")
export class FieldError extends TailwindElement {
  @property({ type: Boolean })
  hidden = true;

  render() {
    return html`<div
      class="text-danger-500"
      aria-live="polite"
      ?hidden=${this.hidden}
    >
      <slot></slot>
    </div>`;
  }
}
