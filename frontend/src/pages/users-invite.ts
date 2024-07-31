import { localized, msg, str } from "@lit/localize";
import { customElement, state } from "lit/decorators.js";

import needLogin from "@/utils/decorators/needLogin";
import LiteElement, { html } from "@/utils/LiteElement";

@localized()
@customElement("btrix-users-invite")
@needLogin
export class UsersInvite extends LiteElement {
  @state()
  private invitedEmail?: string;

  render() {
    let successMessage;

    if (this.invitedEmail) {
      successMessage = html`
        <div>
          <btrix-alert variant="success"
            >${msg(str`Sent invite to ${this.invitedEmail}`)}</btrix-alert
          >
        </div>
      `;
    }
    return html`<div class="grid gap-4">
      <header class="text-xl font-semibold">
        <h1 class="mr-2 inline-block">${msg("Users")}</h1>
        <sl-tag class="uppercase" variant="primary" size="small"
          >${msg("admin")}</sl-tag
        >
      </header>

      ${successMessage}

      <main class="rounded-lg border p-4 md:p-8 md:pt-6">
        <h2 class="mb-4 text-lg font-medium">${msg("Invite Users")}</h2>
        <btrix-invite-form
          .orgs=${this.userInfo?.orgs || []}
          @btrix-invite-success=${this.onSuccess}
        ></btrix-invite-form>
      </main>
    </div>`;
  }

  private onSuccess(event: CustomEvent<{ inviteEmail: string }>) {
    this.invitedEmail = event.detail.inviteEmail;
  }
}
