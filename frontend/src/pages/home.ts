import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";

@localized()
export class Home extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Boolean })
  isAdmin: boolean | null = null;

  @state()
  private isInviteComplete?: boolean;

  render() {
    if (!this.authState) {
      return this.renderLoggedOut();
    }

    if (this.isAdmin === true) {
      return this.renderLoggedInAdmin();
    }

    if (this.isAdmin === false) {
      return this.renderLoggedInNonAdmin();
    }

    return html`<div class="flex items-center justify-center my-24 text-4xl">
      <sl-spinner></sl-spinner>
    </div>`;
  }

  private renderLoggedInAdmin() {
    return html`
      <div>
        <header
          class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border md:py-8"
        >
          <h1 class="text-2xl font-medium">${msg("Welcome")}</h1>
          <p class="mt-4 text-neutral-600">
            ${msg("Invite users to start archiving.")}
          </p>
        </header>
        <hr />
      </div>
      <main class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border">
        <h2 class="text-2xl font-medium mb-4">${msg("Invite a User")}</h2>

        ${this.isInviteComplete
          ? html`
              <sl-button @click=${() => (this.isInviteComplete = false)}
                >${msg("Send another invite")}</sl-button
              >
            `
          : html`
              <p class="mb-4 text-neutral-600 text-sm">
                ${msg("Each user will manage their own archive.")}
              </p>

              <btrix-invite-form
                .authState=${this.authState}
                @success=${() => (this.isInviteComplete = true)}
              ></btrix-invite-form>
            `}
      </main>
    `;
  }

  private renderLoggedInNonAdmin() {
    return html`renderLoggedInNonAdmin`;
  }

  private renderLoggedOut() {
    return html`renderLoggedOut`;
  }
}
