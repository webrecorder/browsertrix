import { localized } from "@lit/localize";
import { html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { TailwindElement } from "@/classes/TailwindElement";

/**
 * @slot
 * @slot dropdown
 */
@customElement("btrix-workflow-filter")
@localized()
export class WorkflowFilter extends TailwindElement {
  @property({ type: Boolean })
  checked?: boolean;

  @property({ type: Boolean })
  multiple?: boolean;

  render() {
    if (this.multiple) {
      return html`
        <sl-dropdown distance="4" hoist stay-open-on-select>
          ${this.renderButton()}

          <slot name="dropdown"></slot>
        </sl-dropdown>
      `;
    }

    return this.renderButton();
  }

  private renderButton() {
    return html`
      <sl-button
        slot=${ifDefined(this.multiple ? "trigger" : undefined)}
        role="checkbox"
        aria-checked=${this.checked ? "true" : "false"}
        size="small"
        ?caret=${this.multiple}
        outline
        pill
      >
        ${this.multiple && this.checked
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
