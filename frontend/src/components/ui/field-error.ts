import { localized } from "@lit/localize";
import { html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

@customElement("btrix-field-error")
@localized()
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
