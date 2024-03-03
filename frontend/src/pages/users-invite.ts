import { state, property, customElement } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import { needLogin } from "@/utils/auth";
import type { CurrentUser } from "@/types/user";

@localized()
@customElement("btrix-users-invite")
@needLogin
export class UsersInvite extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @state()
  private invitedEmail?: string;

  firstUpdated() {
    this.checkEnabledInvites();
  }

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
          .authState=${this.authState}
          .orgs=${this.userInfo?.orgs || []}
          .defaultOrg=${this.userInfo?.orgs.find(
            (org) => org.default === true,
          ) ?? null}
          @success=${this.onSuccess}
        ></btrix-invite-form>
      </main>
    </div>`;
  }

  private onSuccess(event: CustomEvent<{ inviteEmail: string }>) {
    this.invitedEmail = event.detail.inviteEmail;
  }

  async checkEnabledInvites() {
    const resp = await fetch("/api/auth/jwt/login/methods");
    if (resp.status == 200) {
      const data = await resp.json();
      if (!data.invites_enabled){
        this.navTo(`/`);
      }
    }
  }
}
