import { localized, msg, str } from "@lit/localize";
import type { SlInput } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import { html, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import { columns } from "./ui/columns";

import { TailwindElement } from "@/classes/TailwindElement";
import { APIController } from "@/controllers/api";
import { NavigateController } from "@/controllers/navigate";
import { NotifyController } from "@/controllers/notify";
import type { APIUser } from "@/index";
import type { APIPaginatedList } from "@/types/api";
import type { CurrentUser } from "@/types/user";
import { isApiError } from "@/utils/api";
import type { AuthState } from "@/utils/AuthService";
import { maxLengthValidator } from "@/utils/form";
import { AccessCode, isAdmin, isCrawler } from "@/utils/orgs";
import slugifyStrict from "@/utils/slugify";
import appState, { AppStateService, use } from "@/utils/state";
import { formatAPIUser } from "@/utils/user";

import "./components/billing";

type Tab = "information" | "members" | "billing";
type User = {
  email: string;
  role: number;
};
type Invite = User & {
  created: string;
  inviterEmail: string;
};
export type Member = User & {
  name: string;
};
export type UserRoleChangeEvent = CustomEvent<{
  user: Member;
  newRole: number;
}>;
export type OrgRemoveMemberEvent = CustomEvent<{
  member: Member;
}>;

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
 *
 * @fires org-user-role-change
 * @fires org-remove-member
 */
@localized()
@customElement("btrix-org-settings")
export class OrgSettings extends TailwindElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo!: CurrentUser;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  activePanel: Tab = "information";

  @property({ type: Boolean })
  isAddingMember = false;

  @use()
  appState = appState;

  @state()
  private isSavingOrgName = false;

  @state()
  private pendingInvites: Invite[] = [];

  @state()
  private isAddMemberFormVisible = false;

  @state()
  private isSubmittingInvite = false;

  @state()
  private slugValue = "";

  private readonly api = new APIController(this);
  private readonly navigate = new NavigateController(this);
  private readonly notify = new NotifyController(this);

  private get org() {
    return this.appState.org;
  }

  private get tabLabels(): Record<Tab, string> {
    return {
      information: msg("General"),
      members: msg("Members"),
      billing: msg("Billing"),
    };
  }

  private readonly validateOrgNameMax = maxLengthValidator(40);

  async willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("isAddingMember") && this.isAddingMember) {
      this.isAddMemberFormVisible = true;
    }
    if (
      changedProperties.has("activePanel") &&
      this.activePanel === "members"
    ) {
      void this.fetchPendingInvites();
    }
  }

  render() {
    return html`<header class="mb-5">
        <h1 class="text-xl font-semibold leading-8">${msg("Org Settings")}</h1>
      </header>

      <btrix-tab-list activePanel=${this.activePanel} hideIndicator>
        <header slot="header" class="flex h-5 items-end justify-between">
          ${when(
            this.activePanel === "members",
            () => html`
              <h3>${msg("Active Members")}</h3>
              <sl-button
                href=${`${this.navigate.orgBasePath}/settings/members?invite`}
                variant="primary"
                size="small"
                @click=${this.navigate.link}
              >
                <sl-icon
                  slot="prefix"
                  name="person-add"
                  aria-hidden="true"
                  library="default"
                ></sl-icon>
                ${msg("Invite New Member")}
              </sl-button>
            `,
            () => html` <h3>${this.tabLabels[this.activePanel]}</h3> `,
          )}
        </header>
        ${this.renderTab("information", "settings")}
        ${this.renderTab("members", "settings/members")}
        ${when(this.appState.settings?.billingEnabled, () =>
          this.renderTab("billing", "settings/billing"),
        )}

        <btrix-tab-panel name="information">
          ${this.renderInformation()}
        </btrix-tab-panel>
        <btrix-tab-panel name="members">
          ${this.renderMembers()}
        </btrix-tab-panel>
        <btrix-tab-panel name="billing">
          <btrix-org-settings-billing
            .authState=${this.authState}
            .salesEmail=${this.appState.settings?.salesEmail}
          ></btrix-org-settings-billing>
        </btrix-tab-panel>
      </btrix-tab-list>`;
  }

  private renderTab(name: Tab, path: string) {
    const isActive = name === this.activePanel;
    return html`
      <btrix-navigation-button
        slot="nav"
        href=${`${this.navigate.orgBasePath}/${path}`}
        .active=${isActive}
        @click=${this.navigate.link}
        aria-selected=${isActive}
      >
        ${this.tabLabels[name]}
      </btrix-navigation-button>
    `;
  }

  private renderInformation() {
    if (!this.org) return;

    return html`<div class="rounded-lg border">
      <form @submit=${this.onOrgInfoSubmit}>
        ${columns([
          [
            html`
              <sl-input
                class="with-max-help-text mb-2"
                name="orgName"
                size="small"
                label=${msg("Org Name")}
                placeholder=${msg("My Organization")}
                autocomplete="off"
                value=${this.org.name}
                minlength="2"
                required
                help-text=${this.validateOrgNameMax.helpText}
                @sl-input=${this.validateOrgNameMax.validate}
              ></sl-input>
            `,
            msg(
              "Name of your organization that is visible to all org members.",
            ),
          ],
          [
            html`
              <sl-input
                class="mb-2"
                name="orgSlug"
                size="small"
                label=${msg("Custom URL Identifier")}
                placeholder="my-organization"
                autocomplete="off"
                value=${this.org.slug}
                minlength="2"
                maxlength="30"
                required
                help-text=${msg(
                  str`Org home page: ${window.location.protocol}//${
                    window.location.hostname
                  }/orgs/${
                    this.slugValue
                      ? slugifyStrict(this.slugValue)
                      : this.org.slug
                  }`,
                )}
                @sl-input=${this.handleSlugInput}
              ></sl-input>
            `,
            msg(
              "Customize your organization's web address for accessing Browsertrix.",
            ),
          ],
          [
            html`
              <btrix-copy-field
                class="mb-2"
                label=${msg("Org ID")}
                value=${this.org.id}
              ></btrix-copy-field>
            `,
            msg("Use this ID to reference this org in the Browsertrix API."),
          ],
        ])}
        <footer class="flex justify-end border-t px-4 py-3">
          <sl-button
            class="inline-control-button"
            type="submit"
            size="small"
            variant="primary"
            ?disabled=${this.isSavingOrgName}
            ?loading=${this.isSavingOrgName}
            >${msg("Save Changes")}</sl-button
          >
        </footer>
      </form>
    </div>`;
  }

  private handleSlugInput(e: InputEvent) {
    const input = e.target as SlInput;
    // Ideally this would match against the full character map that slugify uses
    // but this'll do for most use cases
    const end = input.value.match(/[\s*_+~.,()'"!\-:@]$/g) ? "-" : "";
    input.value = slugifyStrict(input.value) + end;
    this.slugValue = slugifyStrict(input.value);

    input.setCustomValidity(
      this.slugValue.length < 2 ? msg("URL Identifier too short") : "",
    );
  }

  private renderMembers() {
    if (!this.org?.users) return;

    const columnWidths = ["1fr", "2fr", "auto", "min-content"];
    const rows = Object.entries(this.org.users).map(([_id, user]) => [
      user.name,
      user.email,
      this.renderUserRoleSelect(user),
      this.renderRemoveMemberButton(user),
    ]);
    return html`
      <section>
        <btrix-data-table
          .columns=${[
            msg("Name"),
            msg("Email"),
            msg("Role"),
            html`<span class="sr-only">${msg("Delete")}</span>`,
          ]}
          .rows=${rows}
          .columnWidths=${columnWidths}
        >
        </btrix-data-table>
      </section>

      ${when(
        this.pendingInvites.length,
        () => html`
          <section class="mt-7">
            <h3 class="mb-2 text-lg font-semibold">
              ${msg("Pending Invites")}
            </h3>

            <btrix-data-table
              .columns=${[
                msg("Email"),
                msg("Role"),
                html`<span class="sr-only">${msg("Remove")}</span>`,
              ]}
              .rows=${this.pendingInvites.map((user) => [
                user.email,
                this.renderUserRole(user),
                this.renderRemoveInviteButton(user),
              ])}
              .columnWidths=${columnWidths}
            >
            </btrix-data-table>
          </section>
        `,
      )}

      <btrix-dialog
        .label=${msg("Invite New Member")}
        .open=${this.isAddingMember}
        @sl-request-close=${this.hideInviteDialog}
        @sl-show=${() => (this.isAddMemberFormVisible = true)}
        @sl-after-hide=${() => (this.isAddMemberFormVisible = false)}
      >
        ${this.isAddMemberFormVisible ? this.renderInviteForm() : ""}
      </btrix-dialog>
    `;
  }

  private renderUserRole({ role }: User) {
    if (isAdmin(role)) return msg("Admin");
    if (isCrawler(role)) return msg("Crawler");
    return msg("Viewer");
  }

  private renderUserRoleSelect(user: Member) {
    // Consider superadmins owners
    const userRole =
      user.role === AccessCode.superadmin ? AccessCode.owner : user.role;
    return html`<sl-select
      value=${userRole}
      size="small"
      @sl-change=${this.selectUserRole(user)}
      hoist
    >
      <sl-option value=${AccessCode.owner}>${"Admin"}</sl-option>
      <sl-option value=${AccessCode.crawler}>${"Crawler"}</sl-option>
      <sl-option value=${AccessCode.viewer}>${"Viewer"}</sl-option>
    </sl-select>`;
  }

  private renderRemoveMemberButton(member: Member) {
    if (!this.org?.users) return;

    let disableButton = false;
    if (member.email === this.userInfo.email) {
      const { [this.userInfo.id]: _currentUser, ...otherUsers } =
        this.org.users;
      const hasOtherAdmin = Object.values(otherUsers).some(({ role }) =>
        isAdmin(role),
      );
      if (!hasOtherAdmin) {
        // Must be another admin in order to remove self
        disableButton = true;
      }
    }
    return html`<sl-icon-button
      class="text-base hover:text-danger"
      name="trash3"
      label=${msg("Remove org member")}
      ?disabled=${disableButton}
      aria-details=${ifDefined(
        disableButton ? msg("Cannot remove only admin member") : undefined,
      )}
      @click=${() =>
        this.dispatchEvent(
          new CustomEvent("org-remove-member", {
            detail: { member },
          }) as OrgRemoveMemberEvent,
        )}
    ></sl-icon-button>`;
  }

  private renderRemoveInviteButton(invite: Invite) {
    return html`<sl-icon-button
      class="text-base hover:text-danger"
      name="trash3"
      label=${msg("Revoke invite")}
      @click=${() => void this.removeInvite(invite)}
    ></sl-icon-button>`;
  }

  private hideInviteDialog() {
    this.navigate.to(`${this.navigate.orgBasePath}/settings/members`);
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

  private async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }

  private async getPendingInvites() {
    const data = await this.api.fetch<APIPaginatedList<Invite>>(
      `/orgs/${this.org!.id}/invites`,
      this.authState!,
    );

    return data.items;
  }

  private async fetchPendingInvites() {
    try {
      this.pendingInvites = await this.getPendingInvites();
    } catch (e) {
      console.debug(e);

      this.notify.toast({
        message: msg("Sorry, couldn't retrieve pending invites at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async onOrgInfoSubmit(e: SubmitEvent) {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;

    const { orgName } = serialize(formEl) as { orgName: string };

    const params = {
      name: orgName,
      slug: this.org!.slug,
    };

    if (this.slugValue) {
      params.slug = slugifyStrict(this.slugValue);
    }

    this.isSavingOrgName = true;

    await this.renameOrg(params);

    this.isSavingOrgName = false;
  }

  private readonly selectUserRole = (user: User) => (e: Event) => {
    this.dispatchEvent(
      new CustomEvent("org-user-role-change", {
        detail: {
          user,
          newRole: Number((e.target as HTMLSelectElement).value),
        },
      }) as UserRoleChangeEvent,
    );
  };

  async onOrgInviteSubmit(e: SubmitEvent) {
    e.preventDefault();

    const formEl = e.target as HTMLFormElement;
    if (!(await this.checkFormValidity(formEl))) return;

    const { inviteEmail, role } = serialize(formEl);

    this.isSubmittingInvite = true;

    try {
      const _data = await this.api.fetch(
        `/orgs/${this.orgId}/invite`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({
            email: inviteEmail,
            role: Number(role),
          }),
        },
      );

      this.notify.toast({
        message: msg(str`Successfully invited ${inviteEmail}.`),
        variant: "success",
        icon: "check2-circle",
      });

      void this.fetchPendingInvites();
      this.hideInviteDialog();
    } catch (e) {
      this.notify.toast({
        message: isApiError(e)
          ? e.message
          : msg("Sorry, couldn't invite user at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isSubmittingInvite = false;
  }

  private async removeInvite(invite: Invite) {
    try {
      await this.api.fetch(
        `/orgs/${this.orgId}/invites/delete`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify({
            email: invite.email,
          }),
        },
      );

      this.notify.toast({
        message: msg(
          str`Successfully removed ${invite.email} from ${this.org!.name}.`,
        ),
        variant: "success",
        icon: "check2-circle",
      });

      this.pendingInvites = this.pendingInvites.filter(
        ({ email }) => email !== invite.email,
      );
    } catch (e) {
      console.debug(e);

      this.notify.toast({
        message: isApiError(e)
          ? e.message
          : msg(str`Sorry, couldn't remove ${invite.email} at this time.`),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async renameOrg({ name, slug }: { name: string; slug: string }) {
    try {
      await this.api.fetch(`/orgs/${this.orgId}/rename`, this.authState!, {
        method: "POST",
        body: JSON.stringify({ name, slug }),
      });

      const user = await this.getCurrentUser();

      AppStateService.updateUserInfo(formatAPIUser(user));
      AppStateService.updateOrgSlug(slug);

      this.navigate.to(`${this.navigate.orgBasePath}/settings`);

      this.notify.toast({
        message: msg("Org successfully updated."),
        variant: "success",
        icon: "check2-circle",
      });
    } catch (e) {
      console.debug(e);

      let message = msg(
        "Sorry, couldn't rename organization at this time. Try again later from org settings.",
      );

      if (isApiError(e)) {
        if (e.details === "duplicate_org_name") {
          message = msg("This org name is already taken, try another one.");
        } else if (e.details === "duplicate_org_slug") {
          message = msg(
            "This org URL identifier is already taken, try another one.",
          );
        } else if (e.details === "invalid_slug") {
          message = msg(
            "This org URL identifier is invalid. Please use alphanumeric characters and dashes (-) only.",
          );
        }
      }

      this.notify.toast({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getCurrentUser(): Promise<APIUser> {
    return this.api.fetch("/users/me", this.authState!);
  }
}
