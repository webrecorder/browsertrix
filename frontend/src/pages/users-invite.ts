import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";

@needLogin
@localized()
export class UsersInvite extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @state()
  private invitedEmail?: string;

  render() {
    let successMessage;

    if (this.invitedEmail) {
      successMessage = html`
        <div>
          <btrix-alert type="success"
            >${msg(str`Sent invite to ${this.invitedEmail}`)}</btrix-alert
          >
        </div>
      `;
    }
    return html`<div class="grid gap-4">
      <header class="text-xl font-bold">
        <h1 class="inline-block mr-2">${msg("Users")}</h1>
        <sl-tag class="uppercase" type="primary" size="small"
          >${msg("admin")}</sl-tag
        >
      </header>

      ${successMessage}

      <main class="border rounded-lg p-4 md:p-8 md:pt-6">
        <h2 class="text-lg font-medium mb-4">${msg("Invite Users")}</h2>
        <btrix-invite-form
          .authState=${this.authState}
          @success=${this.onSuccess}
        ></btrix-invite-form>
      </main>
    </div>`;
  }

  private onSuccess(event: CustomEvent<{ inviteEmail: string }>) {
    this.invitedEmail = event.detail.inviteEmail;
  }
}
