import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "../types/auth";
import LiteElement, { html } from "../utils/LiteElement";

@localized()
export class SignUp extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @state()
  isSignUpComplete?: boolean;

  render() {
    return html`
      <article class="w-full max-w-sm grid gap-5">
        <main class="md:bg-white md:shadow-xl md:rounded-lg md:px-12 md:py-12">
          ${this.isSignUpComplete
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
                  @success=${this.onSuccess}
                  @authenticated=${this.onAuthenticated}
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

  private onSuccess() {
    this.isSignUpComplete = true;
  }

  private onAuthenticated(
    event: CustomEvent<{ auth: string; username: string }>
  ) {
    this.dispatchEvent(
      new CustomEvent("logged-in", {
        detail: {
          ...event.detail,
          firstLogin: true,
        },
      })
    );
  }
}
