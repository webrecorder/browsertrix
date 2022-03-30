import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";
import type { AuthState, LoggedInEvent } from "../utils/AuthService";
import AuthService from "../utils/AuthService";

@localized()
export class SignUp extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @state()
  isSignedUpWithoutAuth?: boolean;

  render() {
    return html`
      <article class="w-full max-w-sm grid gap-5">
        <main class="md:bg-white md:shadow-xl md:rounded-lg p-12">
          ${this.isSignedUpWithoutAuth
            ? html`
                <div
                  class="text-2xl font-semibold mb-5 text-primary"
                  role="alert"
                >
                  ${msg("Successfully signed up")}
                </div>
                <p class="text-lg">
                  ${msg(
                    "Click the link in the verification email we sent you to log in."
                  )}
                </p>
              `
            : html`
                <h1 class="text-3xl font-semibold mb-5">${msg("Sign up")}</h1>

                <btrix-sign-up-form
                  @submit=${this.onSubmit}
                  @authenticated=${this.onAuthenticated}
                  @unauthenticated=${this.onUnauthenticated}
                ></btrix-sign-up-form>
              `}
        </main>
      </article>
    `;
  }

  private onSubmit() {
    if (this.authState) {
      this.dispatchEvent(
        new CustomEvent("log-out", { detail: { redirect: false } })
      );
    }
  }

  private onAuthenticated(event: LoggedInEvent) {
    this.dispatchEvent(
      AuthService.createLoggedInEvent({
        ...event.detail,
        firstLogin: true,
      })
    );
  }

  private onUnauthenticated() {
    this.isSignedUpWithoutAuth = true;
  }
}
