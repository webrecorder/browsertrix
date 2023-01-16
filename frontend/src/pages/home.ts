import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import type { CurrentUser } from "../types/user";
import type { OrgData } from "../utils/orgs";
import LiteElement, { html } from "../utils/LiteElement";

@localized()
export class Home extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: String })
  teamId?: string;

  @state()
  private isInviteComplete?: boolean;

  @state()
  private orgList?: OrgData[];

  connectedCallback() {
    if (this.authState) {
      super.connectedCallback();
      if (this.userInfo && !this.teamId) {
        this.fetchOrgs();
      }
    } else {
      this.navTo("/log-in");
    }
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("teamId") && this.teamId) {
      this.navTo(`/orgs/${this.teamId}/crawls`);
    } else if (changedProperties.has("authState") && this.authState) {
      this.fetchOrgs();
    }
  }

  render() {
    if (!this.userInfo || !this.orgList) {
      return html`
        <div class="flex items-center justify-center my-24 text-3xl">
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    let title: any;
    let content: any;

    if (this.userInfo.isAdmin === true) {
      title = msg("Welcome");
      content = this.renderLoggedInAdmin();
    }

    if (this.userInfo.isAdmin === false) {
      title = msg("Teams");
      content = this.renderLoggedInNonAdmin();
    }

    return html`
      <div class="bg-white">
        <header
          class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border md:py-8"
        >
          <h1 class="text-xl font-medium">${title}</h1>
        </header>
        <hr />
      </div>
      <main class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border">
        ${content}
      </main>
    `;
  }

  private renderLoggedInAdmin() {
    if (this.orgList!.length) {
      return html`
        <section class="border rounded-lg bg-white p-4 md:p-6 mb-5">
          <form
            @submit=${(e: SubmitEvent) => {
              const formData = new FormData(e.target as HTMLFormElement);
              const id = formData.get("crawlId");
              this.navTo(`/crawls/crawl/${id}`);
            }}
          >
            <div class="flex flex-wrap items-center">
              <div
                class="w-full md:w-min grow-0 mr-8 text-lg font-medium whitespace-nowrap"
              >
                ${msg("Go to Crawl")}
              </div>
              <div class="grow mt-2 md:mt-0 md:mr-2">
                <sl-input
                  name="crawlId"
                  placeholder=${msg("Enter Crawl ID")}
                  required
                ></sl-input>
              </div>
              <div class="grow-0 mt-2 md:mt-0 text-right">
                <sl-button variant="neutral" type="submit">
                  <sl-icon slot="prefix" name="arrow-right-circle"></sl-icon>
                  ${msg("Go")}</sl-button
                >
              </div>
            </div>
          </form>
        </section>

        <div class="grid grid-cols-3 gap-8">
          <div class="col-span-3 md:col-span-2">
            <section>
              <h2 class="text-lg font-medium mb-3 mt-2">${msg("All Teams")}</h2>
              <btrix-orgs-list
                .userInfo=${this.userInfo}
                .orgList=${this.orgList}
              ></btrix-orgs-list>
            </section>
          </div>
          <div class="col-span-3 md:col-span-1 md:mt-12">
            <section class="md:border md:rounded-lg md:bg-white p-3 md:p-8">
              <h2 class="text-lg font-medium mb-4">${msg("Invite a User")}</h2>
              ${this.renderInvite()}
            </section>
          </div>
        </div>
      `;
    }

    return html`
      <section class="border rounded-lg bg-white p-4 md:p-8 mb-5">
        <p class="text-lg mb-4 text-neutral-600">
          ${msg("Invite users to start archiving.")}
        </p>

        ${this.renderInvite()}
      </section>
    `;
  }

  private renderLoggedInNonAdmin() {
    if (this.orgList && !this.orgList.length) {
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
        ?skeleton=${!this.orgList}
      ></btrix-orgs-list>
    `;
  }

  private renderInvite() {
    if (this.isInviteComplete) {
      return html`
        <sl-button @click=${() => (this.isInviteComplete = false)}
          >${msg("Send another invite")}</sl-button
        >
      `;
    }

    return html`
      <btrix-invite-form
        .authState=${this.authState}
        @success=${() => (this.isInviteComplete = true)}
      ></btrix-invite-form>
    `;
  }

  private async fetchOrgs() {
    this.orgList = await this.getOrgs();
  }

  private async getOrgs(): Promise<OrgData[]> {
    const data = await this.apiFetch("/orgs", this.authState!);

    return data.orgs;
  }
}
