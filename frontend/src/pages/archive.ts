import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../utils/AuthService";
import type { CurrentUser } from "../types/user";
import type { ArchiveData } from "../utils/archives";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";
import { isOwner } from "../utils/archives";

export type ArchiveTab = "settings" | "members";

const defaultTab = "settings";

@needLogin
@localized()
export class Archive extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: String })
  archiveId?: string;

  @property({ type: String })
  archiveTab: ArchiveTab = defaultTab;

  @property({ type: Boolean })
  isAddingMember: boolean = false;

  @state()
  private archive?: ArchiveData;

  @state()
  private successfullyInvitedEmail?: string;

  async firstUpdated() {
    if (!this.archiveId) return;

    const archive = await this.getArchive(this.archiveId);

    if (!archive) {
      this.navTo("/archives");
    } else {
      this.archive = archive;

      // TODO get archive members
    }
  }

  updated(changedProperties: any) {
    if (changedProperties.has("isAddingMember") && this.isAddingMember) {
      this.successfullyInvitedEmail = undefined;
    }
  }

  render() {
    if (!this.archive) {
      return html`<div
        class="w-full flex items-center justify-center my-24 text-4xl"
      >
        <sl-spinner></sl-spinner>
      </div>`;
    }

    const showMembers = Boolean(this.archive.users);

    return html`<article class="grid gap-4">
      <nav class="font-medium text-sm text-gray-500">
        <a
          class="text-primary hover:underline"
          href="/archives"
          @click="${this.navLink}"
          >${msg("Archives")}</a
        >
        <span class="font-mono">/</span>
        <span>${this.archive.name}</span>
      </nav>

      <main>
        <sl-tab-group @sl-tab-show=${this.updateUrl}>
          <sl-tab
            slot="nav"
            panel="settings"
            ?active=${this.archiveTab === "settings"}
            >${msg("Settings")}</sl-tab
          >
          ${showMembers
            ? html`<sl-tab
                slot="nav"
                panel="members"
                ?active=${this.archiveTab === "members"}
                >${msg("Members")}</sl-tab
              >`
            : ""}

          <sl-tab-panel
            name="settings"
            ?active=${this.archiveTab === "settings"}
            >${this.renderSettings()}</sl-tab-panel
          >
          ${showMembers
            ? html`<sl-tab-panel
                name="members"
                ?active=${this.archiveTab === "members"}
              >
                ${this.isAddingMember
                  ? this.renderAddMember()
                  : this.renderMembers()}
              </sl-tab-panel>`
            : ""}
        </sl-tab-group>
      </main>
    </article>`;
  }

  private renderSettings() {
    return html` TODO `;
  }

  private renderMembers() {
    if (!this.archive!.users) return;

    let successMessage;

    if (this.successfullyInvitedEmail) {
      successMessage = html`
        <div class="my-3">
          <btrix-alert type="success"
            >${msg(
              str`Successfully invited ${this.successfullyInvitedEmail}`
            )}</btrix-alert
          >
        </div>
      `;
    }
    return html`${successMessage}

      <div class="text-right">
        <sl-button
          href=${`/archives/${this.archiveId}/members/add-member`}
          type="primary"
          @click=${this.navLink}
          >${msg("Add Member")}</sl-button
        >
      </div>

      <div role="table">
        <div class="border-b" role="rowgroup">
          <div class="flex font-medium" role="row">
            <div class="w-1/2 px-3 py-2" role="columnheader" aria-sort="none">
              ${msg("Name", { desc: "Team member's name" })}
            </div>
            <div class="px-3 py-2" role="columnheader" aria-sort="none">
              ${msg("Roles", { desc: "Team member's roles" })}
            </div>
          </div>
        </div>
        <div role="rowgroup">
          ${Object.entries(this.archive!.users).map(
            ([id, { name, role }]) => html`
              <div class="border-b flex" role="row">
                <div class="w-1/2 p-3" role="cell">
                  ${name ||
                  html`<span class="text-gray-400">${msg("Member")}</span>`}
                </div>
                <div class="p-3" role="cell">
                  ${isOwner(role) ? msg("Admin") : msg("Viewer")}
                </div>
              </div>
            `
          )}
        </div>
      </div>`;
  }

  private renderAddMember() {
    return html`
      <sl-button
        type="text"
        href=${`/archives/${this.archiveId}/members`}
        @click=${this.navLink}
        ><sl-icon name="arrow-left"></sl-icon> ${msg(
          "Back to members list"
        )}</sl-button
      >

      <div class="mt-3 border rounded-lg p-4 md:p-8 md:pt-6">
        <h2 class="text-lg font-medium mb-4">${msg("Add New Member")}</h2>
        <btrix-archive-invite-form
          @success=${this.onInviteSuccess}
          @cancel=${() => this.navTo(`/archives/${this.archiveId}/members`)}
          .authState=${this.authState}
          .archiveId=${this.archiveId}
        ></btrix-archive-invite-form>
      </div>
    `;
  }

  async getArchive(archiveId: string): Promise<ArchiveData> {
    const data = await this.apiFetch(`/archives/${archiveId}`, this.authState!);

    return data;
  }

  onInviteSuccess(
    event: CustomEvent<{ inviteEmail: string; isExistingUser: boolean }>
  ) {
    this.successfullyInvitedEmail = event.detail.inviteEmail;

    this.navTo(`/archives/${this.archiveId}/members`);
  }

  updateUrl(event: CustomEvent<{ name: ArchiveTab }>) {
    this.navTo(`/archives/${this.archiveId}/${event.detail.name}`);
  }
}
