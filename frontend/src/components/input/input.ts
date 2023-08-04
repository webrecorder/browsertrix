import { html } from "lit";
import { property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg } from "@lit/localize";

import LiteElement from "../../utils/LiteElement";
import "./input.css";

/**
 * Styled input element in the light DOM.
 * Use instead of `sl-input` when disabling shadow DOM is necessary
 * (e.g. for password manager autocomplete)
 * See https://github.com/ikreymer/browsertrix-cloud/issues/72
 * and https://github.com/shoelace-style/shoelace/issues/413
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
  value?: any;

  @property()
  autocomplete?: any;

  @property()
  required?: any;

  @property({ type: Boolean })
  passwordToggle?: boolean;

  @state()
  isPasswordVisible: boolean = false;

  render() {
    return html`
      <div class="sl-label">
        <label for=${this.id}>${this.label}</label>
      </div>
      <div class="sl-input-wrapper">
        <input
          class="sl-input"
          id=${this.id}
          name=${ifDefined(this.name)}
          type=${this.type === "password" && this.isPasswordVisible
            ? "text"
            : ifDefined(this.type as any)}
          autocomplete=${ifDefined(this.autocomplete)}
          placeholder=${ifDefined(this.placeholder)}
          value=${ifDefined(this.value)}
          ?required=${Boolean(this.required)}
          @keydown=${this.handleKeyDown}
        />
        ${this.passwordToggle
          ? html`
              <sl-icon-button
                class="sl-input-icon-button"
                label=${this.isPasswordVisible
                  ? msg("Hide password")
                  : msg("Show password")}
                name=${this.isPasswordVisible ? "eye-slash" : "eye"}
                @click=${this.onTogglePassword}
              ></sl-icon-button>
            `
          : ""}
      </div>
    `;
  }

  private onTogglePassword() {
    this.isPasswordVisible = !this.isPasswordVisible;
  }

  handleKeyDown(event: KeyboardEvent) {
    // Enable submit on enter when using <sl-button type="submit">
    if (event.key === "Enter") {
      const form = this.closest("form") as HTMLFormElement;
      if (form) {
        const submitButton = form.querySelector(
          'sl-button[type="submit"]'
        ) as HTMLButtonElement;
        if (submitButton) {
          submitButton.click();
        }
      }
    }
  }
}
