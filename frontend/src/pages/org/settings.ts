import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import { isOwner, AccessCode } from "../../utils/orgs";
import type { OrgData } from "../../utils/orgs";
import type { CurrentUser } from "../../types/user";

type Tab = "information" | "members";
type User = {
  email: string;
  role: number;
};
type Member = User & {
  name: string;
};
type Invite = User & {
  created: string;
  inviterEmail: string;
};

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
  pendingInvites: Invite[] = [];

  @state()
  private isAddMemberFormVisible = false;

  @state()
  private isSavingOrgName = false;

  @state()
  private isSubmittingInvite = false;

  private get tabLabels() {
    return {
      information: msg("Org Information"),
      members: msg("Members"),
    };
  }

  async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("isAddingMember") && this.isAddingMember) {
      this.isAddMemberFormVisible = true;
    }
    if (
      changedProperties.has("activePanel") &&
      this.activePanel === "members"
    ) {
      this.fetchPendingInvites();
    }
  }

  render() {
    return html`<header class="mb-5">
        <h2 class="text-xl font-semibold leading-10">${msg("Org Settings")}</h2>
      </header>

      <btrix-tab-list activePanel=${this.activePanel} ?hideIndicator=${true}>
        <header slot="header" class="flex items-end justify-between h-5">
          ${when(
            this.activePanel === "members",
            () => html`
              <h3>${msg("Active Members")}</h3>
              <sl-button
                href=${`/orgs/${this.orgId}/settings/members?invite`}
                variant="primary"
                size="small"
                @click=${this.navLink}
                >${msg("Invite New Member")}</sl-button
              >
            `,
            () => html` <h3>${this.tabLabels[this.activePanel]}</h3> `
          )}
        </header>
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
      >
        ${this.tabLabels[name]}
      </a>
    `;
  }

  private renderInformation() {
    return html`<div class="rounded border p-5">
      <form @submit=${this.onOrgNameSubmit}>
        <div class="flex items-end">
          <div class="flex-1 mr-3">
            <sl-input
              name="orgName"
              size="small"
              label=${msg("Org Name")}
              autocomplete="off"
              value=${this.org.name}
              required
            ></sl-input>
          </div>
          <div class="flex-0">
            <sl-button
              type="submit"
              size="small"
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
    const columnWidths = ["100%", "12rem", "1.5rem"];
    return html`
      <section class="rounded border overflow-hidden">
        <btrix-data-table
          .columns=${[
            msg("Name"),
            msg("Role", { desc: "Organization member's role" }),
            "",
          ]}
          .rows=${Object.entries(this.org.users!).map(([id, user]) => [
            user.name,
            this.renderUserRole(user),
            this.renderRemoveUserButton(user),
          ])}
          .columnWidths=${columnWidths}
        >
        </btrix-data-table>
      </section>

      ${when(
        this.pendingInvites.length,
        () => html`
          <section class="mt-7">
            <h3 class="text-lg font-semibold mb-2">
              ${msg("Pending Invites")}
            </h3>

            <div class="rounded border overflow-hidden">
              <btrix-data-table
                .columns=${[
                  html`<div class="w-52">${msg("Email")}</div>`,
                  msg("Role", { desc: "Organization member's role" }),
                  "",
                ]}
                .rows=${this.pendingInvites.map((user) => [
                  html`<div>${user.email}</div>`,
                  this.renderUserRole(user),
                  this.renderRemoveUserButton(user),
                ])}
                .columnWidths=${columnWidths}
              >
              </btrix-data-table>
            </div>
          </section>
        `
      )}

      <btrix-dialog
        label=${msg("Invite New Member")}
        ?open=${this.isAddingMember}
        @sl-request-close=${this.hideInviteDialog}
        @sl-show=${() => (this.isAddMemberFormVisible = true)}
        @sl-after-hide=${() => (this.isAddMemberFormVisible = false)}
      >
        ${this.isAddMemberFormVisible ? this.renderInviteForm() : ""}
      </btrix-dialog>
    `;
  }

  private renderUserRole(user: User) {
    return html`<sl-select value=${user.role} size="small">
      <sl-menu-item value=${AccessCode.owner}> ${"Admin"} </sl-menu-item>
      <sl-menu-item value=${AccessCode.crawler}> ${"Crawler"} </sl-menu-item>
      <sl-menu-item value=${AccessCode.viewer}> ${"Viewer"} </sl-menu-item>
    </sl-select>`;
  }

  private renderRemoveUserButton(user: Member | Invite) {
    if (user.email === this.userInfo.email) {
      const { [this.userInfo.id]: currentUser, ...otherUsers } =
        this.org.users!;
      const hasOtherAdmin = Object.values(otherUsers).some(({ role }) =>
        isOwner(role)
      );
      if (!hasOtherAdmin) {
        // Must be another admin in order to remove self
        return "";
      }
    }
    return html`<btrix-icon-button
      name="trash"
      @click=${() => this.removeUser(user)}
    ></btrix-icon-button>`;
  }

  private hideInviteDialog() {
    this.navTo(`/orgs/${this.orgId}/settings/members`);
  }

  private renderInviteForm() {
    return html`
      <form
        id="orgInviteForm"
        @submit=${this.onOrgInviteSubmit}
        @reset=${this.hideInviteDialog}
      >
        <div class="mb-5">
          <sl-input
            id="inviteEmail"
            name="inviteEmail"
            type="email"
            label=${msg("Email")}
            placeholder=${msg("org-member@email.com", {
              desc: "Placeholder text for email to invite",
            })}
            required
          >
          </sl-input>
        </div>
        <div class="mb-5">
          <sl-radio-group
            name="role"
            label="Permission"
            value=${AccessCode.viewer}
          >
            <sl-radio value=${AccessCode.owner}>
              ${msg("Admin — Can create crawls and manage org members")}
            </sl-radio>
            <sl-radio value=${AccessCode.crawler}>
              ${msg("Crawler — Can create crawls")}
            </sl-radio>
            <sl-radio value=${AccessCode.viewer}>
              ${msg("Viewer — Can view crawls")}
            </sl-radio>
          </sl-radio-group>
        </div>
      </form>
      <div slot="footer" class="flex justify-between">
        <sl-button form="orgInviteForm" type="reset" size="small"
          >${msg("Cancel")}</sl-button
        >
        <sl-button
          form="orgInviteForm"
          variant="primary"
          type="submit"
          size="small"
          ?loading=${this.isSubmittingInvite}
          ?disabled=${this.isSubmittingInvite}
          >${msg("Invite")}</sl-button
        >
      </div>
    `;
  }

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }

  private getPendingInvites(): Promise<Invite[]> {
    return this.apiFetch(`/orgs/${this.org.id}/invites`, this.authState!).then(
      (data) => data.pending_invites
    );
  }

  private async fetchPendingInvites() {
    try {
      this.pendingInvites = await this.getPendingInvites();
    } catch (e: any) {
      console.debug(e);

      this.notify({
        message: msg("Sorry, couldn't retrieve pending invites at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async onOrgNameSubmit(e: SubmitEvent) {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;

    const { orgName } = serialize(formEl);

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
    } catch (e: any) {
      this.notify({
        message: e.isApiError
          ? e.message
          : msg("Sorry, couldn't update organization name at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSavingOrgName = false;
  }

  async onOrgInviteSubmit(e: SubmitEvent) {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;

    const { inviteEmail, role } = serialize(formEl);

    this.isSubmittingInvite = true;

    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/invite`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({
            email: inviteEmail,
            role: Number(role),
          }),
        }
      );

      this.notify({
        message: msg(str`Successfully invited ${inviteEmail}.`),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });

      this.hideInviteDialog();
    } catch (e: any) {
      this.notify({
        message: e.isApiError
          ? e.message
          : msg("Sorry, couldn't invite user at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingInvite = false;
  }

  private async removeUser(user: Member | Invite) {
    if (
      user.email === this.userInfo.email &&
      !window.confirm(
        msg(`Are you sure you want to remove yourself from ${this.org.name}?`)
      )
    ) {
      return;
    }

    try {
      await this.apiFetch(`/orgs/${this.orgId}/remove`, this.authState!, {
        method: "POST",
        body: JSON.stringify({
          email: user.email,
        }),
      });

      this.notify({
        message: msg(
          str`Successfully removed ${
            "name" in user ? user.name : user.email
          } from ${this.org.name}.`
        ),
        variant: "success",
        icon: "check2-circle",
        duration: 8000,
      });
    } catch (e: any) {
      console.debug(e);

      this.notify({
        message: e.isApiError
          ? e.message
          : msg(
              `Sorry, couldn't remove ${
                "name" in user ? user.name : user.email
              } at this time.`
            ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
}

customElements.define("btrix-org-settings", OrgSettings);
