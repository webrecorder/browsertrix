import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";
import type { LoggedInEvent } from "../utils/AuthService";
import AuthService from "../utils/AuthService";

@localized()
export class Join extends LiteElement {
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

  render() {
    return html`
      <article class="w-full max-w-sm grid gap-5">
        <main class="md:bg-white md:shadow-xl md:rounded-lg md:px-12 md:py-12">
          <h1 class="text-3xl font-semibold mb-5">${msg("Join")}</h1>

          <btrix-sign-up-form
            email=${this.email!}
            inviteToken=${this.token!}
            @authenticated=${this.onAuthenticated}
          ></btrix-sign-up-form>
        </main>
      </article>
    `;
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
