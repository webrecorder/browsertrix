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

type Tab = "information" | "members";

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

  @property({ type: String })
  activePanel: Tab = "information";

  @property({ type: Boolean })
  isAddingMember = false;

  @state()
  private successfullyInvitedEmail?: string;

  @state()
  private isSavingOrgName = false;

  private get tabLabels() {
    return {
      information: msg("Org Information"),
      members: msg("Members"),
    };
  }

  async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("isAddingMember") && this.isAddingMember) {
      this.successfullyInvitedEmail = undefined;
    }
  }

  render() {
    if (this.isAddingMember) {
      return this.renderAddMember();
    }

    return html`<header class="mb-5">
        <h2 class="text-xl leading-10">${msg("Org Settings")}</h2>
      </header>

      <btrix-tab-list activePanel=${this.activePanel} ?hideIndicator=${true}>
        <header slot="header">${this.tabLabels[this.activePanel]}</header>
        ${this.renderTab("information", "settings")}
        ${this.renderTab("members", "settings/members")}

        <btrix-tab-panel name="information"
          >${this.renderInformation()}</btrix-tab-panel
        >
        <btrix-tab-panel name="members"
          >${this.renderMembers()}</btrix-tab-panel
        >
      </btrix-tab-list>`;
  }

  private renderTab(name: Tab, path: string) {
    const isActive = name === this.activePanel;
    return html`
      <a
        slot="nav"
        href=${`/orgs/${this.orgId}/${path}`}
        class="block font-medium rounded-sm mb-2 mr-2 p-2 transition-all ${isActive
          ? "text-blue-600 bg-blue-50 shadow-sm"
          : "text-neutral-600 hover:bg-neutral-50"}"
        @click=${this.navLink}
        aria-selected=${isActive}
        tabindex="0"
      >
        ${this.tabLabels[name]}
      </a>
    `;
  }

  private renderInformation() {
    console.log(this.org);
    return html`<div class="rounded border p-5">
      <form @submit=${this.onOrgNameSubmit}>
        <div class="flex items-end">
          <div class="flex-1 mr-3">
            <sl-input
              name="orgName"
              label=${msg("Org Name")}
              autocomplete="off"
              value=${this.org.name}
              required
            ></sl-input>
          </div>
          <div class="flex-0">
            <sl-button
              type="submit"
              variant="primary"
              ?disabled=${this.isSavingOrgName}
              ?loading=${this.isSavingOrgName}
              >${msg("Save Changes")}</sl-button
            >
          </div>
        </div>
      </form>
    </div>`;
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
