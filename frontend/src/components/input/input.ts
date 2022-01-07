import { html } from "lit";
import { property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import LiteElement from "../../utils/LiteElement";
import "./input.css";

/**
 * Styled input element in the light DOM.
 * Use instead of `sl-input` when disabling shadow DOM is necessary
 * See https://github.com/ikreymer/browsertrix-cloud/issues/72
 *
 * Usage example:
 * ```ts
 * <btrix-input label="Email" name="email"></btrix-input>
 * ```
 */
export class Input extends LiteElement {
  @property()
  label?: string;

  @property({ type: String })
  id: string = "";

  @property({ type: String })
  name?: string;

  @property({ type: String })
  type?: string;

  @property()
  autocomplete?: any;

  @property()
  required?: any;

  render() {
    return html`
      <label class="block mb-1 text-sm" for="password">${this.label}</label>
      <input
        class="sl-input block border border-gray-300 rounded-md px-4 w-full h-10"
        id=${this.id}
        name=${ifDefined(this.name)}
        type=${ifDefined(this.type as any)}
        autocomplete=${ifDefined(this.autocomplete)}
        ?required=${Boolean(this.required)}
      />
    `;
  }
}
