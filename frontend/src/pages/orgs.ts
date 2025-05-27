import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement, state } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import needLogin from "@/decorators/needLogin";
import type { APIPaginatedList } from "@/types/api";
import type { OrgData } from "@/utils/orgs";

@customElement("btrix-orgs")
@localized()
@needLogin
export class Orgs extends BtrixElement {
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

    return html` <btrix-orgs-list .orgList=${this.orgList}></btrix-orgs-list> `;
  }

  private async getOrgs() {
    const data = await this.api.fetch<APIPaginatedList<OrgData>>("/orgs");

    return data.items;
  }
}
