import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "../types/auth";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";

@needLogin
@localized()
export class UsersInvite extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  render() {
    return html`<div class="grid gap-4">
      <header class="text-xl font-bold">
        <h1 class="inline-block mr-2">${msg("Users")}</h1>
        <sl-tag class="uppercase" type="primary" size="small"
          >${msg("admin")}</sl-tag
        >
      </header>

      <main class="border rounded-lg p-4 md:p-8 md:pt-6">
        <h2 class="text-lg font-medium mb-4">${msg("Invite Users")}</h2>
        <bt-invite-form .authState=${this.authState}></bt-invite-form>
      </main>
    </div>`;
  }
}
