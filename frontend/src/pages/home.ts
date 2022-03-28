import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import type { CurrentUser } from "../types/user";
import type { ArchiveData } from "../utils/archives";
import LiteElement, { html } from "../utils/LiteElement";

@localized()
export class Home extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @state()
  private isInviteComplete?: boolean;

  @state()
  private archiveList?: ArchiveData[];

  async firstUpdated() {
    this.archiveList = await this.getArchives();
  }

  connectedCallback() {
    if (this.authState) {
      super.connectedCallback();
    } else {
      this.navTo("/log-in");
    }
  }

  render() {
    let title: any;
    let content: any;

    if (this.userInfo) {
      if (this.userInfo.isAdmin === true) {
        title = msg("Welcome");
        content = this.renderLoggedInAdmin();
      }

      if (this.userInfo.isAdmin === false) {
        title = msg("Archives");
        content = this.renderLoggedInNonAdmin();
      }
    }

    return html`
      <div class="bg-white">
        <header
          class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border md:py-8"
        >
          <h1 class="text-2xl font-medium">${title}</h1>
        </header>
        <hr />
      </div>
      <main class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border">
        ${content}
      </main>
    `;
  }

  private renderLoggedInAdmin() {
    if (!this.archiveList) {
      return;
    }

    if (this.archiveList.length) {
      return html`
        <div class="grid grid-cols-3 gap-8">
          <div class="col-span-3 md:col-span-2">
            <section>
              <h2 class="text-xl font-medium mb-4 mt-3">
                ${msg("All Archives")}
              </h2>
              <btrix-archives-list
                .userInfo=${this.userInfo}
                .archiveList=${this.archiveList}
              ></btrix-archives-list>
            </section>
          </div>
          <div class="col-span-3 md:col-span-1">
            <section class="border rounded-lg bg-white p-4 md:p-8">
              <h2 class="text-xl font-medium mb-4">${msg("Invite a User")}</h2>
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
    if (this.archiveList && !this.archiveList.length) {
      return html`<div class="border rounded-lg bg-white p-4 md:p-8">
        <p class="text-neutral-400 text-center">
          ${msg("You don't have any archives.")}
        </p>
      </div>`;
    }

    return html`
      <btrix-archives-list
        .userInfo=${this.userInfo}
        .archiveList=${this.archiveList}
        ?skeleton=${!this.archiveList}
      ></btrix-archives-list>
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

  private async getArchives(): Promise<ArchiveData[]> {
    const data = await this.apiFetch("/archives", this.authState!);

    return data.archives;
  }
}
