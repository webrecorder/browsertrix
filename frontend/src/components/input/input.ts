import { html } from "lit";
import { property, state } from "lit/decorators.js";
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

  @property({ type: String })
  placeholder?: string;

  @property()
  autocomplete?: any;

  @property()
  required?: any;

  @property({ type: Boolean })
  togglePassword?: boolean;

  @state()
  isPasswordVisible: boolean = false;

  render() {
    return html`
      <div class="mb-1">
        <label for=${this.id} class="text-sm">${this.label}</label>
      </div>
      <div
        class="sl-input flex items-center border border-gray-300 rounded-md h-10"
      >
        <input
          class="flex-1 ${this.togglePassword ? "ml-4" : "mx-4"}"
          id=${this.id}
          name=${ifDefined(this.name)}
          type=${this.type === "password" && this.isPasswordVisible
            ? "text"
            : ifDefined(this.type as any)}
          autocomplete=${ifDefined(this.autocomplete)}
          placeholder=${ifDefined(this.placeholder)}
          ?required=${Boolean(this.required)}
        />
        ${this.togglePassword
          ? html`
              <div class="mr-2">
                <sl-icon-button
                  name=${this.isPasswordVisible ? "eye-slash" : "eye"}
                  @click=${this.onTogglePassword}
                ></sl-icon-button>
              </div>
            `
          : ""}
      </div>
    `;
  }

  private onTogglePassword() {
    this.isPasswordVisible = !this.isPasswordVisible;
  }
}
