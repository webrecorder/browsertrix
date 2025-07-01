import { localized } from "@lit/localize";
import { html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

@customElement("btrix-workflow-filter")
@localized()
export class WorkflowFilter extends TailwindElement {
  @property({ type: Boolean })
  checked?: boolean;

  @property({ type: Boolean })
  caret?: boolean;

  render() {
    return html`
      <sl-button
        role="checkbox"
        aria-checked=${this.checked ? "true" : "false"}
        size="small"
        ?caret=${this.caret}
        outline
        pill
      >
        ${this.caret && this.checked
          ? nothing
          : html`
              <sl-icon
                class="size-4 text-base"
                slot="prefix"
                name=${this.checked ? "check2-circle" : "plus-circle-dotted"}
              ></sl-icon>
            `}
        <slot></slot>
      </sl-button>
    `;
  }
}
