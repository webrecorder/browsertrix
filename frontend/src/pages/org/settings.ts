import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import type { SlButton } from "@shoelace-style/shoelace";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import { isOwner, AccessCode } from "../../utils/orgs";
import type { OrgData } from "../../utils/orgs";
import type { CurrentUser } from "../../types/user";

/**
 * Usage:
 * ```ts
 * <btrix-org-settings
 *  .authState=${authState}
 *  .userInfo=${userInfo}
 *  .org=${org}
 *  .orgId=${orgId}
 *  ?isAddingMember=${isAddingMember}
 * ></btrix-org-settings>
 * ```
 */
@localized()
export class OrgSettings extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo!: CurrentUser;

  @property({ type: String })
  orgId!: string;

  @property({ type: Object })
  org!: OrgData;

  @property({ type: Boolean })
  isAddingMember = false;

  @state()
  private successfullyInvitedEmail?: string;

  @state()
  private isEditingOrgName = false;

  @state()
  private isSavingOrgName = false;

  async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("isAddingMember") && this.isAddingMember) {
      this.successfullyInvitedEmail = undefined;
    }
  }

  render() {
    if (this.isAddingMember) {
      return this.renderAddMember();
    }

    return html`<btrix-section-heading
        >${msg("Org Information")}</btrix-section-heading
      >
      <section class="mt-5 mb-10">${this.renderOrgName()}</section>
      <btrix-section-heading>${msg("Org Members")}</btrix-section-heading>
      <section class="mt-5">${this.renderMembers()}</section>`;
  }

  private renderOrgName() {
    return html`<form
      @submit=${this.onOrgNameSubmit}
      @reset=${() => (this.isEditingOrgName = false)}
    >
      <div class="flex items-end">
        <div class="flex-1 mr-3">
          <sl-input
            name="orgName"
            label=${msg("Org Name")}
            autocomplete="off"
            value=${this.org.name}
            ?readonly=${!this.isEditingOrgName}
            ?required=${this.isEditingOrgName}
          ></sl-input>
        </div>
        <div class="flex-0">
          ${when(
            this.isEditingOrgName,
            () => html`
              <sl-button type="reset" class="mr-1">${msg("Cancel")}</sl-button>
              <sl-button
                type="submit"
                variant="primary"
                ?disabled=${this.isSavingOrgName}
                ?loading=${this.isSavingOrgName}
                >${msg("Save Changes")}</sl-button
              >
            `,
            () => html`
              <sl-button
                @click=${(e: MouseEvent) => {
                  this.isEditingOrgName = true;
                  (e.target as SlButton)
                    .closest("form")
                    ?.querySelector("sl-input")
                    ?.focus();
                }}
                >${msg("Edit")}</sl-button
              >
            `
          )}
        </div>
      </div>
    </form>`;
  }

  private renderMembers() {
    let successMessage;

    if (this.successfullyInvitedEmail) {
      successMessage = html`
        <div class="my-3">
          <btrix-alert variant="success"
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
          href=${`/orgs/${this.orgId}/settings/members?invite`}
          @click=${this.navLink}
          >${msg("Add Member")}</sl-button
        >
      </div>

      <div role="table">
        <div class="border-b" role="rowgroup">
          <div class="flex font-medium" role="row">
            <div class="w-1/2 px-3 py-2" role="columnheader" aria-sort="none">
              ${msg("Name")}
            </div>
            <div class="px-3 py-2" role="columnheader" aria-sort="none">
              ${msg("Role", { desc: "Organization member's role" })}
            </div>
          </div>
        </div>
        <div role="rowgroup">
          ${Object.entries(this.org.users!).map(
            ([id, { name, role }]) => html`
              <div class="border-b flex" role="row">
                <div class="w-1/2 p-3" role="cell">
                  ${name ||
                  html`<span class="text-gray-400">${msg("Member")}</span>`}
                </div>
                <div class="p-3" role="cell">
                  ${isOwner(role)
                    ? msg("Admin")
                    : role === AccessCode.crawler
                    ? msg("Crawler")
                    : msg("Viewer")}
                </div>
              </div>
            `
          )}
        </div>
      </div>`;
  }

  private renderAddMember() {
    return html`
      <div class="mb-5">
        <a
          class="text-neutral-500 hover:text-neutral-600 text-sm font-medium"
          href=${`/orgs/${this.orgId}/settings/members`}
          @click=${this.navLink}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${msg("Back to Settings")}</span
          >
        </a>
      </div>

      <div class="border rounded-lg p-4 md:p-8 md:pt-6">
        <h2 class="text-lg font-medium mb-4">${msg("Add New Member")}</h2>
        <btrix-org-invite-form
          @success=${this.onInviteSuccess}
          @cancel=${() => this.navTo(`/orgs/${this.orgId}/settings/members`)}
          .authState=${this.authState}
          .orgId=${this.orgId}
        ></btrix-org-invite-form>
      </div>
    `;
  }

  private async onOrgNameSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!this.org) return;
    const { orgName } = serialize(e.target as HTMLFormElement);

    this.isSavingOrgName = true;

    try {
      await this.apiFetch(`/orgs/${this.org.id}/rename`, this.authState!, {
        method: "POST",
        body: JSON.stringify({ name: orgName }),
      });

      this.notify({
        message: msg("Updated organization name."),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });

      this.org = {
        ...this.org,
        name: orgName as string,
      };

      this.isEditingOrgName = false;
      this.dispatchEvent(
        new CustomEvent("update-user-info", { bubbles: true })
      );
    } catch (e) {
      console.debug(e);
      this.notify({
        message: msg("Sorry, couldn't update organization name at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSavingOrgName = false;
  }

  private onInviteSuccess(
    event: CustomEvent<{ inviteEmail: string; isExistingUser: boolean }>
  ) {
    this.successfullyInvitedEmail = event.detail.inviteEmail;

    this.navTo(`/orgs/${this.orgId}/settings/members`);
  }
}

customElements.define("btrix-org-settings", OrgSettings);
