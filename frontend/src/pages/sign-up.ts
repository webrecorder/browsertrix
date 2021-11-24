import { state, property, query } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "../types/auth";
import LiteElement, { html } from "../utils/LiteElement";

@localized()
export class SignUp extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @state()
  successMessage?: string;

  @state()
  serverError?: string;

  @state()
  isSubmitting: boolean = false;

  render() {
    let successMessage, serverError;

    if (this.successMessage) {
      successMessage = html`
        <div>
          <bt-alert type="success">${this.successMessage}</bt-alert>
        </div>
      `;
    }

    if (this.serverError) {
      serverError = html`
        <div class="mb-5">
          <bt-alert id="formError" type="danger">${this.serverError}</bt-alert>
        </div>
      `;
    }

    return html`
      <article class="w-full max-w-sm grid gap-5">
        ${successMessage}

        <main class="md:bg-white md:shadow-xl md:rounded-lg md:px-12 md:py-12">
          <h1>Sign up</h1>

          <sl-form @sl-submit="${this.onSubmit}" aria-describedby="formError">
            <div class="mb-5">
              <sl-input
                id="email"
                name="email"
                label="${msg("Email")}"
                placeholder="you@email.com"
                autocomplete="username"
                required
              >
              </sl-input>
            </div>
            <div class="mb-5">
              <sl-input
                id="password"
                name="password"
                type="password"
                label="${msg("Password")}"
                autocomplete="new-password"
                toggle-password
                required
              >
              </sl-input>
            </div>

            ${serverError}

            <sl-button
              class="w-full"
              type="primary"
              ?loading=${this.isSubmitting}
              submit
              >${msg("Log in")}</sl-button
            >
          </sl-form>
        </main>
      </article>
    `;
  }

  async onSubmit(event: { detail: { formData: FormData } }) {
    if (this.authState) {
      this.dispatchEvent(
        new CustomEvent("log-out", { detail: { redirect: false } })
      );
    }
  }
}
