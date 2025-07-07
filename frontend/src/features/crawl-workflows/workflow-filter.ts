import { localized } from "@lit/localize";
import type { SlDropdown } from "@shoelace-style/shoelace";
import { html } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { TailwindElement } from "@/classes/TailwindElement";

/**
 * @slot
 * @slot dropdown-header
 * @slot dropdown-content
 */
@customElement("btrix-workflow-filter")
@localized()
export class WorkflowFilter extends TailwindElement {
  @property({ type: Boolean })
  checked?: boolean;

  @property({ type: Boolean })
  select?: boolean;

  @property({ type: Boolean })
  stayOpenOnChange?: boolean;

  @query("sl-dropdown")
  private readonly dropdown?: SlDropdown | null;

  render() {
    if (this.select) {
      return html`
        <sl-dropdown
          distance="4"
          hoist
          ?stayOpenOnSelect=${this.stayOpenOnChange}
          class="group/dropdown"
          @sl-change=${() => {
            if (!this.stayOpenOnChange) {
              void this.dropdown?.hide();
            }
          }}
        >
          ${this.renderButton()}

          <div
            class="flex max-h-[var(--auto-size-available-height)] max-w-[var(--auto-size-available-width)] flex-col overflow-hidden rounded border bg-white"
          >
            <header
              class="flex-shrink-0 flex-grow-0 overflow-hidden rounded-t bg-white"
            >
              <slot name="dropdown-header"></slot>
            </header>
            <slot name="dropdown-content"></slot>
          </div>
        </sl-dropdown>
      `;
    }

    return this.renderButton();
  }

  private renderButton() {
    return html`
      <sl-button
        slot=${ifDefined(this.select ? "trigger" : undefined)}
        role="checkbox"
        aria-checked=${this.checked ? "true" : "false"}
        size="small"
        ?caret=${this.select}
        outline
        pill
        class="group-open/dropdown:part-[base]:border-primary-300 group-open/dropdown:part-[base]:text-primary-700"
      >
        <sl-icon
          class="size-4 text-base"
          slot="prefix"
          name=${this.checked ? "check2-circle" : "plus-circle-dotted"}
        ></sl-icon>
        <slot></slot>
      </sl-button>
    `;
  }
}
