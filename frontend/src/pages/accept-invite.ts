import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";
import type { AuthState, LoggedInEvent } from "../utils/AuthService";
import AuthService from "../utils/AuthService";
import { DASHBOARD_ROUTE } from "../routes";

@localized()
export class AcceptInvite extends LiteElement {
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

  firstUpdated() {
    if (!this.isLoggedIn) {
      this.dispatchEvent(
        new CustomEvent("notify", {
          detail: {
            message: msg("Log in to continue."),
            type: "success",
            icon: "check2-circle",
            duration: 10000,
          },
        })
      );

      this.navTo(
        `/log-in?redirectUrl=${encodeURIComponent(
          `${window.location.pathname}${window.location.search}`
        )}`
      );
    }
  }

  render() {
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
      <article class="w-full max-w-sm grid gap-5">
        ${serverError}

        <main class="md:bg-white md:shadow-xl md:rounded-lg md:px-12 md:py-12">
          <h1 class="text-3xl text-center font-semibold mb-5">
            ${msg("Join archive")}
          </h1>

          <!-- TODO archive details -->

          <div class="text-center">
            <sl-button type="primary" @click=${this.onAccept}
              >${msg("Accept invitation")}</sl-button
            >
          </div>
        </main>
      </article>
    `;
  }

  private async onAccept() {
    if (!this.authState || !this.isLoggedIn) {
      // TODO handle error
      this.serverError = msg("Something unexpected went wrong");

      return;
    }

    try {
      await this.apiFetch(
        `/archives/invite-accept/${this.token}`,
        this.authState,
        {
          method: "POST",
        }
      );

      this.dispatchEvent(
        new CustomEvent("notify", {
          detail: {
            // TODO archive details
            message: msg("You've joined the archive."),
            type: "success",
            icon: "check2-circle",
          },
        })
      );

      this.navTo(DASHBOARD_ROUTE);
    } catch (err: any) {
      if (err.isApiError && err.message === "Invalid Invite Code") {
        this.serverError = msg("This invitation is not valid.");
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }
    }
  }
}
