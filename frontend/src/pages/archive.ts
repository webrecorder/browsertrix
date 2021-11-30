import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState, CurrentUser } from "../types/auth";
import type { ArchiveData } from "../utils/archives";
import LiteElement, { html } from "../utils/LiteElement";
import { needLogin } from "../utils/auth";
import { isOwner, AccessCode } from "../utils/archives";

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

  @state()
  isSubmitting: boolean = false;

  @state()
  serverError?: string;

  @state()
  successfullyInvitedEmail?: string;

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

  private renderAddMember() {
    let successMessage, formError;

    if (this.successfullyInvitedEmail) {
      successMessage = html`
        <div class="mb-3">
          <bt-alert type="success"
            >${msg(
              str`Successfully invited ${this.successfullyInvitedEmail}`
            )}</bt-alert
          >
        </div>
      `;
    }

    if (this.serverError) {
      formError = html`
        <div class="mb-5">
          <bt-alert id="formError" type="danger">${this.serverError}</bt-alert>
        </div>
      `;
    }

    return html`
      ${successMessage}

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
            <sl-radio-group label="Select an option">
              <sl-radio name="role" value=${AccessCode.owner}>
                ${msg("Admin")}
                <span class="text-gray-500">
                  - ${msg("Can view, run, configure and manage crawls")}</span
                >
              </sl-radio>
              <sl-radio name="role" value=${AccessCode.viewer} checked>
                ${msg("Viewer")}
                <span class="text-gray-500">
                  - ${msg("Can only view crawls")}</span
                >
              </sl-radio>
            </sl-radio-group>
          </div>

          ${formError}

          <div>
            <sl-button type="primary" submit>${msg("Invite")}</sl-button>
            <sl-button
              type="text"
              href=${`/archives/${this.archiveId}/members`}
              @click=${this.navLink}
              >${msg("Cancel")}</sl-button
            >
          </div>
        </sl-form>
      </div>
    `;
  }

  async getArchive(archiveId: string): Promise<ArchiveData> {
    const data = await this.apiFetch(`/archives/${archiveId}`, this.authState!);

    return data;
  }

  async onSubmitInvite(event: { detail: { formData: FormData } }) {
    if (!this.authState) return;

    this.isSubmitting = true;

    const { formData } = event.detail;
    const inviteEmail = formData.get("inviteEmail") as string;

    try {
      await this.apiFetch(
        `/archives/${this.archiveId}/invite`,
        this.authState,
        {
          method: "POST",
          body: JSON.stringify({
            email: inviteEmail,
            role: Number(formData.get("role")),
          }),
        }
      );

      this.successfullyInvitedEmail = inviteEmail;
    } catch (e: any) {
      if (e?.isApiError) {
        this.serverError = e?.message;
      } else {
        this.serverError = msg("Something unexpected went wrong");
      }
    }

    this.isSubmitting = false;
  }

  updateUrl(event: CustomEvent<{ name: ArchiveTab }>) {
    this.navTo(`/archives/${this.archiveId}/${event.detail.name}`);
  }
}
