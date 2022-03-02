import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import type { CurrentUser } from "../types/user";
import type { ArchiveData } from "../utils/archives";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";
import { isOwner } from "../utils/archives";

@needLogin
@localized()
export class Archives extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @state()
  private archiveList?: ArchiveData[];

  @state()
  private isInviteComplete?: boolean;

  async firstUpdated() {
    this.archiveList = await this.getArchives();
  }

  render() {
    if (!this.archiveList || !this.userInfo) {
      return html`
        <div class="flex items-center justify-center my-24 text-4xl">
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    if (this.userInfo.isAdmin && !this.archiveList.length) {
      return html`
        <div class="bg-white">
          <header
            class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border md:py-8"
          >
            <h1 class="text-2xl font-medium">${msg("Archives")}</h1>
            <p class="mt-4 text-neutral-600">
              ${msg(
                "Invite users to start archiving or create an archive of your own."
              )}
            </p>
          </header>
          <hr />
        </div>
        <main class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border">
          ${this.renderAdminOnboarding()}
        </main>
      `;
    }

    return html`
      <div class="bg-white">
        <header
          class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border md:py-8"
        >
          <h1 class="text-2xl font-medium">${msg("Archives")}</h1>
        </header>
        <hr />
      </div>
      <main class="w-full max-w-screen-lg mx-auto px-3 py-4 box-border">
        ${this.renderArchives()}
      </main>
    `;
  }

  private renderArchives() {
    if (!this.archiveList?.length) {
      return html`<div class="border rounded-lg bg-white p-4 md:p-8">
        <p class="text-neutral-400 text-center">
          ${msg("You don't have any archives.")}
        </p>
      </div>`;
    }

    return html`
      <ul class="border rounded-lg overflow-hidden">
        ${this.archiveList.map(
          (archive) =>
            html`
              <li
                class="p-3 md:p-6 bg-white border-t first:border-t-0 text-primary hover:text-indigo-400"
                role="button"
                @click=${this.makeOnArchiveClick(archive)}
              >
                <span class="font-medium mr-2 transition-colors"
                  >${archive.name}</span
                >
                ${this.userInfo &&
                archive.users &&
                isOwner(archive.users[this.userInfo.id].role)
                  ? html`<sl-tag size="small" type="primary"
                      >${msg("Owner")}</sl-tag
                    >`
                  : ""}
              </li>
            `
        )}
      </ul>
    `;
  }

  private renderAdminOnboarding() {
    if (this.isInviteComplete) {
      return html`
        <div class="border rounded-lg bg-white p-4 md:p-8">
          <h2 class="text-2xl font-medium mb-4">${msg("Invite a User")}</h2>
          <sl-button @click=${() => (this.isInviteComplete = false)}
            >${msg("Send another invite")}</sl-button
          >
        </div>
      `;
    }

    return html`
      <div class="grid grid-cols-2 gap-5">
        <div
          class="col-span-2 md:col-span-1 border rounded-lg bg-white p-4 md:p-8"
        >
          <h2 class="text-2xl font-medium mb-4">${msg("Add Users")}</h2>
          <p class="mb-4 text-neutral-600 text-sm">
            ${msg("Each user will manage their own archive.")}
          </p>

          <sl-form @sl-submit=${console.log}>
            <div class="grid gap-2 mb-5">
              <sl-input
                name="inviteEmail1"
                type="email"
                placeholder=${msg("alice@email.com", {
                  desc: "Placeholder text for email to invite",
                })}
              >
              </sl-input>
              <sl-input
                name="inviteEmail2"
                type="email"
                placeholder=${msg("bob@email.com", {
                  desc: "Placeholder text for email to invite",
                })}
              >
              </sl-input>
              <sl-input
                name="inviteEmail3"
                type="email"
                placeholder=${msg("carol@email.com", {
                  desc: "Placeholder text for email to invite",
                })}
              >
              </sl-input>
            </div>

            <div>
              <sl-button
                type="primary"
                submit
                ?loading=${false}
                ?disabled=${false}
                >${msg("Send Invites")}</sl-button
              >
            </div>
          </sl-form>
        </div>
        <div
          class="col-span-2 md:col-span-1 border rounded-lg bg-white p-4 md:p-8"
        >
          <h2 class="text-2xl font-medium mb-4">${msg("Create an Archive")}</h2>
          <p class="mb-4 text-neutral-600 text-sm">
            ${msg(
              "Start by creating your own archive and then add collaborators."
            )}
          </p>

          <div>
            <sl-button>${msg("Add New Archive")}</sl-button>
          </div>
        </div>
      </div>
    `;
  }

  async getArchives(): Promise<ArchiveData[]> {
    const data = await this.apiFetch("/archives", this.authState!);

    return data.archives;
  }

  makeOnArchiveClick(archive: ArchiveData): Function {
    const navigate = () => this.navTo(`/archives/${archive.id}/crawls`);

    if (typeof window.getSelection !== undefined) {
      return () => {
        // Prevent navigation on user text selection
        if (window.getSelection()?.type === "Range") {
          return;
        }

        navigate();
      };
    }

    return navigate;
  }
}
