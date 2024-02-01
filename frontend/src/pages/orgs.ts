import { state, property, customElement } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "@/utils/AuthService";
import type { CurrentUser } from "@/types/user";
import type { OrgData } from "@/utils/orgs";
import LiteElement, { html } from "@/utils/LiteElement";
import { needLogin } from "@/utils/auth";
import type { APIPaginatedList } from "@/types/api";

@localized()
@customElement("btrix-orgs")
@needLogin
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
          class="mx-auto box-border w-full max-w-screen-desktop px-3 py-4 md:py-8"
        >
          <h1 class="text-xl font-medium">${msg("Organizations")}</h1>
        </header>
        <hr />
      </div>
      <main class="mx-auto box-border w-full max-w-screen-desktop px-3 py-4">
        ${this.orgList
          ? this.renderOrgs()
          : html`
              <div class="my-24 flex items-center justify-center text-3xl">
                <sl-spinner></sl-spinner>
              </div>
            `}
      </main>
    `;
  }

  private renderOrgs() {
    if (!this.orgList?.length) {
      return html`<div class="rounded-lg border bg-white p-4 md:p-8">
        <p class="text-center text-neutral-400">
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

  private async getOrgs() {
    const data = await this.apiFetch<APIPaginatedList<OrgData>>(
      "/orgs",
      this.authState!,
    );

    return data.items;
  }
}
