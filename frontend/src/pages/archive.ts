import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { AuthState, CurrentUser } from "../types/auth";
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
  archive?: ArchiveData;

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

  render() {
    if (!this.archive) {
      return html`<div
        class="w-full flex items-center justify-center my-24 text-4xl"
      >
        <sl-spinner></sl-spinner>
      </div>`;
    }

    return html`<article class="grid gap-4">
      <header>
        <h1 class="text-2xl font-bold">${this.archive.name}</h1>
      </header>

      <main>
        <sl-tab-group @sl-tab-show=${this.updateUrl}>
          <sl-tab
            slot="nav"
            panel="settings"
            ?active=${this.archiveTab === "settings"}
            >Settings</sl-tab
          >
          <sl-tab
            slot="nav"
            panel="members"
            ?active=${this.archiveTab === "members"}
            >Members</sl-tab
          >

          <sl-tab-panel
            name="settings"
            ?active=${this.archiveTab === "settings"}
            >${this.renderSetting()}</sl-tab-panel
          >
          <sl-tab-panel name="members" ?active=${this.archiveTab === "members"}>
            ${this.isAddingMember
              ? this.renderAddMember()
              : this.renderMembers()}
          </sl-tab-panel>
        </sl-tab-group>
      </main>
    </article>`;
  }

  private renderSetting() {
    return html` TODO `;
  }

  private renderAddMember() {
    let formError;

    // TODO
    // if (this.formState.context.serverError) {
    //   formError = html`
    //     <div class="mb-5">
    //       <bt-alert id="formError" type="danger"
    //         >${this.formState.context.serverError}</bt-alert
    //       >
    //     </div>
    //   `;
    // }

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

        <sl-form
          class="max-w-md"
          @sl-submit=${this.onSubmitInvite}
          aria-describedby="formError"
        >
          <div class="mb-5">
            <sl-input
              id="inviteEmail"
              name="inviteEmail"
              type="email"
              label="${msg("Email")}"
              placeholder="team-member@email.com"
              required
            >
            </sl-input>
          </div>
          <div class="mb-5">
            <!-- TODO role list & permissions -->
            <sl-radio-group label="Select an option">
              <sl-radio value=${40}>
                ${msg("Admin")}
                <span class="text-gray-500">
                  - ${msg("Read and write access")}</span
                >
              </sl-radio>
              <sl-radio value=${10} checked>
                ${msg("Member")}
                <span class="text-gray-500"> - ${msg("Read-only access")}</span>
              </sl-radio>
            </sl-radio-group>
          </div>

          ${formError}

          <div>
            <sl-button type="primary" submit>${msg("Invite")}</sl-button>
            <sl-button type="text" @click=${console.log}
              >${msg("Cancel")}</sl-button
            >
          </div>
        </sl-form>
      </div>
    `;
  }

  private renderMembers() {
    return html` <div class="text-right">
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
            ([id, accessCode]) => html`
              <div class="border-b flex" role="row">
                <div class="w-1/2 p-3" role="cell">(TODO) ${id}</div>
                <div class="p-3" role="cell">
                  ${isOwner(accessCode) ? msg("Owner") : msg("Member")}
                </div>
              </div>
            `
          )}
        </div>
      </div>`;
  }

  async getArchive(archiveId: string): Promise<ArchiveData> {
    const data = await this.apiFetch(`/archives/${archiveId}`, this.authState!);

    return data;
  }

  async onSubmitInvite() {}

  updateUrl(event: CustomEvent<{ name: ArchiveTab }>) {
    this.navTo(`/archives/${this.archiveId}/${event.detail.name}`);
  }
}
