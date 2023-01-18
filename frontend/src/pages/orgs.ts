import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import type { CurrentUser } from "../types/user";
import type { OrgData } from "../utils/orgs";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";

@needLogin
@localized()
export class Orgs extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @state()
  private orgList?: OrgData[];

  async firstUpdated() {
    this.orgList = await this.getOrgs();
  }

  render() {
    return html`
      <div class="bg-white">
        <header
          class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border md:py-8"
        >
          <h1 class="text-xl font-medium">${msg("Organizations")}</h1>
        </header>
        <hr />
      </div>
      <main class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border">
        ${this.orgList
          ? this.renderOrgs()
          : html`
              <div class="flex items-center justify-center my-24 text-3xl">
                <sl-spinner></sl-spinner>
              </div>
            `}
      </main>
    `;
  }

  private renderOrgs() {
    if (!this.orgList?.length) {
      return html`<div class="border rounded-lg bg-white p-4 md:p-8">
        <p class="text-neutral-400 text-center">
          ${msg("You don't have any organizations.")}
        </p>
      </div>`;
    }

    return html`
      <btrix-orgs-list
        .userInfo=${this.userInfo}
        .orgList=${this.orgList}
      ></btrix-orgs-list>
    `;
  }

  private async getOrgs(): Promise<OrgData[]> {
    const data = await this.apiFetch("/orgs", this.authState!);

    return data.orgs;
  }
}
