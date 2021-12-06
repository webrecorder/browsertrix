import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";
import type { AuthState, LoggedInEvent } from "../utils/AuthService";
import AuthService from "../utils/AuthService";
import { DASHBOARD_ROUTE } from "../routes";

@localized()
export class Join extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: String })
  token?: string;

  @property({ type: String })
  email?: string;

  @state()
  serverError?: string;

  connectedCallback(): void {
    if (this.token && this.email) {
      super.connectedCallback();
    } else {
      throw new Error("Missing email or token");
    }
  }

  private get isLoggedIn(): boolean {
    return Boolean(
      this.authState && this.email && this.authState.username === this.email
    );
  }

  render() {
    // TODO use API endpoint to check if it's an existing user

    return html`
      <article class="w-full max-w-sm grid gap-5">
        <main class="md:bg-white md:shadow-xl md:rounded-lg md:px-12 md:py-12">
          ${this.isLoggedIn ? this.renderAccept() : this.renderSignUp()}
        </main>
      </article>
    `;
  }

  private renderAccept() {
    let serverError;

    if (this.serverError) {
      serverError = html`
        <div class="mb-5">
          <btrix-alert id="formError" type="danger"
            >${this.serverError}</btrix-alert
          >
        </div>
      `;
    }

    return html`
      ${serverError}

      <div class="text-center">
        <sl-button type="primary" @click=${this.onAccept}
          >Accept invitation</sl-button
        >
      </div>
    `;
  }

  private renderSignUp() {
    return html`<h1 class="text-3xl font-semibold mb-5">${msg("Join")}</h1>

      <btrix-sign-up-form
        email=${this.email!}
        inviteToken=${this.token!}
        @submit=${this.onSubmit}
        @authenticated=${this.onAuthenticated}
      ></btrix-sign-up-form> `;
  }

  private onSubmit() {
    //
  }

  private async onAccept() {
    if (!this.authState || !this.isLoggedIn) {
      // TODO handle error
      this.serverError = msg("Something unexpected went wrong");

      return;
    }

    try {
      await this.apiFetch(`/invite/accept/${this.token}`, this.authState);

      this.navTo(DASHBOARD_ROUTE);
    } catch (err: any) {
      if (err.isApiError && err.message === "Invalid Invite Code") {
        this.serverError = msg("This invitation is not valid.");
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }
    }
  }

  private onAuthenticated(event: LoggedInEvent) {
    this.dispatchEvent(
      AuthService.createLoggedInEvent({
        ...event.detail,
        // TODO separate logic for confirmation message
        // firstLogin: true,
      })
    );
  }
}
