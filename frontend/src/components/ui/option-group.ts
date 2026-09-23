import { localized } from "@lit/localize";
import { css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";

/**
 * @slot label
 */
@customElement("btrix-option-group")
@localized()
export class OptionGroup extends TailwindElement {
  static styles = css`
    :host {
      display: contents;
    }
  `;

  @property({ type: String })
  label?: string;

  render() {
    return html`<div
        class="px-4 py-3 text-xs font-medium leading-none text-neutral-500"
      >
        <slot name="label">${this.label}</slot>
      </div>
      <slot></slot>`;
  }
}
