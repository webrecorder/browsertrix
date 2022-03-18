import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import type { CurrentUser } from "../types/user";
import LiteElement, { html } from "../utils/LiteElement";

@localized()
export class Home extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @state()
  private isInviteComplete?: boolean;

  connectedCallback() {
    if (this.authState) {
      super.connectedCallback();
    } else {
      this.navTo("/log-in");
    }
  }

  render() {
    if (this.userInfo) {
      if (this.userInfo.isAdmin === true) {
        return this.renderLoggedInAdmin();
      }

      if (this.userInfo.isAdmin === false) {
        return this.renderLoggedInNonAdmin();
      }
    }

    return html`
      <div class="bg-white" role="presentation">
        <header
          class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border md:py-8"
        >
          <h1 class="text-2xl font-medium h-8"></h1>
        </header>
        <hr />
      </div>
    `;
  }

  private renderLoggedInAdmin() {
    return html`
      <div class="bg-white">
        <header
          class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border md:py-8"
        >
          <h1 class="text-2xl font-medium">${msg("Welcome")}</h1>
        </header>
        <hr />
      </div>
      <main class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border">
        <div class="md:border md:rounded-lg md:bg-white p-3 md:p-8">
          <h2 class="text-xl font-medium mb-4">${msg("Invite a User")}</h2>

          ${this.isInviteComplete
            ? html`
                <sl-button @click=${() => (this.isInviteComplete = false)}
                  >${msg("Send another invite")}</sl-button
                >
              `
            : html`
                <p class="mb-2 text-neutral-600 text-sm">
                  ${msg("Invite users to start archiving.")}
                </p>
                <p class="mb-4 text-neutral-600 text-sm">
                  ${msg("Each user will manage their own archive.")}
                </p>

                <btrix-invite-form
                  .authState=${this.authState}
                  @success=${() => (this.isInviteComplete = true)}
                ></btrix-invite-form>
              `}
        </div>
      </main>
      <btrix-archives
        .authState="${this.authState}"
        .userInfo="${this.userInfo}"
      ></btrix-archives>
    `;
  }

  private renderLoggedInNonAdmin() {
    return html`
      <btrix-archives
        .authState="${this.authState}"
        .userInfo="${this.userInfo}"
      ></btrix-archives>
    `;
  }
}
