import { localized, msg, str } from "@lit/localize";
import type { SlInput } from "@shoelace-style/shoelace";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";
import {
  html,
  nothing,
  unsafeCSS,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";

import stylesheet from "./settings.stylesheet.css";

import { BtrixElement } from "@/classes/BtrixElement";
import type { APIUser } from "@/index";
import { columns } from "@/layouts/columns";
import { pageHeader } from "@/layouts/pageHeader";
import { RouteNamespace } from "@/routes";
import type { APIPaginatedList } from "@/types/api";
import { isApiError } from "@/utils/api";
import { formValidator, maxLengthValidator } from "@/utils/form";
import { AccessCode, isAdmin, isCrawler } from "@/utils/orgs";
import slugifyStrict from "@/utils/slugify";
import { AppStateService } from "@/utils/state";
import { tw } from "@/utils/tailwind";
import { formatAPIUser } from "@/utils/user";

import "./components/billing";
import "./components/crawling-defaults";
import "./components/profile";

const styles = unsafeCSS(stylesheet);

type Tab = "information" | "members" | "billing" | "crawling-defaults";
type User = {
  email: string;
  role: AccessCode;
};
type Invite = User & {
  created: string;
  inviterEmail: string;
};
export type Member = User & {
  name?: string;
};
export type UserRoleChangeEvent = CustomEvent<{
  user: Member;
  newRole: AccessCode;
}>;
export type OrgRemoveMemberEvent = CustomEvent<{
  member: Member;
}>;

/**
 * Usage:
 * ```ts
 * <btrix-org-settings
 *  .org=${org}
 *  ?isAddingMember=${isAddingMember}
 * ></btrix-org-settings>
 * ```
 *
 * @fires org-user-role-change
 * @fires org-remove-member
 */
@customElement("btrix-org-settings")
@localized()
export class OrgSettings extends BtrixElement {
  static styles = styles;

  @property({ type: String })
  activePanel: Tab = "information";

  @property({ type: Boolean })
  isAddingMember = false;

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

  private get tabLabels(): Record<Tab, string> {
    return {
      information: msg("General"),
      members: msg("Members"),
      billing: msg("Billing"),
      "crawling-defaults": msg("Crawling Defaults"),
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

  // TODO (emma) maybe upstream this into BtrixElement?
  handleHashChange = (e: HashChangeEvent) => {
    const { hash } = new URL(e.newURL);
    if (!hash) return;

    const el = this.shadowRoot?.querySelector<HTMLElement>(hash);

    el?.focus();
    el?.scrollIntoView({
      behavior: window.matchMedia("prefers-reduced-motion: reduce").matches
        ? "instant"
        : "smooth",
    });
  };

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("hashchange", this.handleHashChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.handleHashChange);
  }

  render() {
    return html` ${pageHeader({
        title: msg("Org Settings"),
        actions:
          this.userInfo?.orgs && this.userInfo.orgs.length > 1 && this.userOrg
            ? html`
                <div class="text-neutral-400">
                  ${msg(
                    html`Viewing
                      <strong class="font-medium"
                        >${this.userOrg.name}</strong
                      >`,
                  )}
                </div>
              `
            : nothing,
        classNames: tw`mb-3 lg:mb-5`,
      })}

      <btrix-tab-group active=${this.activePanel} placement="start">
        ${this.renderTab("information", "settings")}
        ${this.renderTab("members", "settings/members")}
        ${when(this.appState.settings?.billingEnabled, () =>
          this.renderTab("billing", "settings/billing"),
        )}
        ${this.renderTab("crawling-defaults", "settings/crawling-defaults")}

        <btrix-tab-group-panel name="information">
          ${this.renderPanelHeader({ title: msg("General") })}
          ${this.renderInformation()}
          <btrix-org-settings-profile></btrix-org-settings-profile>
          ${this.renderApi()}
        </btrix-tab-group-panel>
        <btrix-tab-group-panel name="members">
          ${this.renderPanelHeader({
            title: msg("Active Members"),
            actions: html`
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
          })}
          ${this.renderMembers()}
        </btrix-tab-group-panel>
        <btrix-tab-group-panel name="billing">
          ${this.renderPanelHeader({ title: msg("Current Plan") })}
          <btrix-org-settings-billing
            .salesEmail=${this.appState.settings?.salesEmail}
          ></btrix-org-settings-billing>
        </btrix-tab-group-panel>
        <btrix-tab-group-panel name="crawling-defaults">
          ${this.renderPanelHeader({
            title: msg("Crawling Defaults"),
            actions: html`
              <sl-tooltip
                content=${msg(
                  "Default settings for all new crawl workflows. Existing workflows will not be affected.",
                )}
              >
                <sl-icon
                  class="text-base text-neutral-500"
                  name="info-circle"
                ></sl-icon>
              </sl-tooltip>
            `,
          })}
          <btrix-org-settings-crawling-defaults></btrix-org-settings-crawling-defaults>
        </btrix-tab-group-panel>
      </btrix-tab-group>`;
  }

  private renderPanelHeader({
    title,
    actions,
  }: {
    title: string;
    actions?: TemplateResult;
  }) {
    return html`
      <header class="mb-2 flex items-center justify-between">
        <h3 class="text-lg font-medium">${title}</h3>
        ${actions}
      </header>
    `;
  }

  private renderTab(name: Tab, path: string) {
    return html`
      <btrix-tab-group-tab
        slot="nav"
        panel=${name}
        href=${`${this.navigate.orgBasePath}/${path}`}
        @click=${this.navigate.link}
      >
        ${choose(name, [
          [
            "information",
            () => html`<sl-icon name="info-circle-fill"></sl-icon>`,
          ],
          ["members", () => html`<sl-icon name="people-fill"></sl-icon>`],
          ["billing", () => html`<sl-icon name="credit-card-fill"></sl-icon>`],
          [
            "crawling-defaults",
            () => html`<sl-icon name="file-code-fill"></sl-icon>`,
          ],
        ])}
        ${this.tabLabels[name]}
      </btrix-tab-group-tab>
    `;
  }

  private renderInformation() {
    if (!this.userOrg) return;

    return html`<section class="rounded-lg border">
      <form @submit=${this.onOrgInfoSubmit}>
        <div class="p-5">
          ${columns([
            [
              html`
                <sl-input
                  class="with-max-help-text hide-required-content"
                  name="orgName"
                  size="small"
                  label=${msg("Org Name")}
                  placeholder=${msg("My Organization")}
                  autocomplete="off"
                  value=${this.userOrg.name}
                  minlength="2"
                  required
                  help-text=${this.validateOrgNameMax.helpText}
                  @sl-input=${this.validateOrgNameMax.validate}
                ></sl-input>
              `,
              msg(
                "Choose a name that represents your organization, your team, or your personal web archive.",
              ),
            ],
            [
              html`
                <sl-input
                  id="org-url"
                  class="hide-required-content mb-2 part-[input]:pl-0"
                  name="orgSlug"
                  size="small"
                  label=${msg("Org URL")}
                  placeholder="my-organization"
                  autocomplete="off"
                  value=${this.orgSlugState || ""}
                  minlength="2"
                  maxlength="30"
                  required
                  @sl-input=${this.handleSlugInput}
                >
                  <div slot="prefix" class="font-light text-neutral-400">
                    ${window.location.hostname}${window.location.port
                      ? `:${window.location.port}`
                      : ""}/${RouteNamespace.PrivateOrgs}/
                  </div>
                </sl-input>
              `,
              msg(
                "Customize your org's Browsertrix URL. This will also apply to the URL to your org's public page, if you've enabled it.",
              ),
            ],
          ])}
        </div>
        <footer class="flex justify-end border-t px-4 py-3">
          <sl-button
            type="submit"
            size="small"
            variant="primary"
            ?disabled=${this.isSavingOrgName}
            ?loading=${this.isSavingOrgName}
          >
            ${msg("Save")}
          </sl-button>
        </footer>
      </form>
    </section>`;
  }

  private renderApi() {
    if (!this.userOrg) return;

    return html` <h2 class="mb-2 mt-7 text-lg font-medium">
        ${msg("Developer Tools")}
      </h2>

      <section class="rounded-lg border">
        <div class="p-5">
          ${columns([
            [
              html`
                <btrix-copy-field
                  class="mb-2"
                  label=${msg("Org ID")}
                  value=${this.orgId}
                ></btrix-copy-field>
              `,
              msg("Use this ID to reference your org in the Browsertrix API."),
            ],
          ])}
        </div>
      </section>`;
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
    const rows = Object.entries(this.org.users).map(
      ([_id, user]) =>
        [
          user.name,
          user.email,
          this.renderUserRoleSelect(user),
          this.renderRemoveMemberButton(user),
        ] as const,
    );
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

      <section class="mt-7">
        <header>
          <h3 class="mb-2 text-lg font-medium">${msg("Pending Invites")}</h3>
        </header>
        ${when(
          this.pendingInvites.length,
          () => html`
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
          `,
          () => html`
            <p
              class="rounded border bg-neutral-50 p-3 text-center text-neutral-500"
            >
              ${msg("No pending invites to show.")}
            </p>
          `,
        )}
      </section>

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
    if (this.userInfo && member.email === this.userInfo.email) {
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
          <sl-radio-group name="role" label="Role" value=${AccessCode.viewer}>
            <sl-radio value=${AccessCode.viewer} class="radio-card">
              <div
                class="col-start-2 flex items-baseline justify-between gap-2"
              >
                ${msg("Viewer")}
                <span class="text-xs text-gray-500">
                  ${msg("View archived items and collections")}
                </span>
              </div>
              <sl-details
                @sl-hide=${this.stopProp}
                @sl-after-hide=${this.stopProp}
                class="details-card text-xs"
              >
                <span slot="summary">Permissions</span>
                <ul class="ms-4 list-disc text-gray-500">
                  <li>${msg("View crawl workflows")}</li>
                  <li>${msg("View, replay, and download archived items")}</li>
                  <li>${msg("View collections")}</li>
                </ul>
              </sl-details>
            </sl-radio>

            <sl-radio value=${AccessCode.crawler} class="radio-card">
              <div
                class="col-start-2 flex items-baseline justify-between gap-2"
              >
                ${msg("Crawler")}
                <span class="text-xs text-gray-500">
                  ${msg("Create, evaluate, and curate archived items")}
                </span>
              </div>
              <sl-details
                @sl-hide=${this.stopProp}
                @sl-after-hide=${this.stopProp}
                class="details-card text-xs"
              >
                <span slot="summary">Permissions</span>
                <p class="mb-1 text-gray-500">
                  ${msg("All Viewer permissions, plus:")}
                </p>
                <ul class="ms-4 list-disc text-gray-500">
                  <li>${msg("Create crawl workflows")}</li>
                  <li>${msg("Create browser profiles")}</li>
                  <li>${msg("Upload archived items")}</li>
                  <li>${msg("Run QA analysis")}</li>
                  <li>${msg("Rate and review archived items")}</li>
                  <li>${msg("Create, edit, and share collections")}</li>
                </ul>
              </sl-details>
            </sl-radio>

            <sl-radio value=${AccessCode.owner} class="radio-card">
              <div
                class="col-start-2 flex items-baseline justify-between gap-2"
              >
                ${msg("Admin")}
                <span class="text-xs text-gray-500">
                  ${this.appState.settings?.billingEnabled
                    ? msg("Manage org and billing settings")
                    : msg("Manage org")}
                </span>
              </div>
              <sl-details
                @sl-hide=${this.stopProp}
                @sl-after-hide=${this.stopProp}
                class="details-card text-xs"
              >
                <span slot="summary">${msg("Permissions")}</span>
                <p class="mb-1 text-gray-500">
                  ${msg("All Crawler permissions, plus:")}
                </p>
                <ul class="ms-4 list-disc text-gray-500">
                  ${this.appState.settings?.billingEnabled &&
                  html`<li class="text-warning">
                      ${msg("Manage subscription")}
                    </li>
                    <li class="text-warning">
                      ${msg("Manage billing details")}
                    </li>`}
                  <li>${msg("Edit org name and URL")}</li>
                  <li>${msg("Manage org members")}</li>
                  <li>${msg("View and edit org defaults")}</li>
                </ul>
              </sl-details>
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

  private readonly checkFormValidity = formValidator(this);

  private async getPendingInvites() {
    const data = await this.api.fetch<APIPaginatedList<Invite>>(
      `/orgs/${this.orgId}/invites`,
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
        id: "pending-invites-retrieve-error",
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
      slug: this.orgSlugState!,
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
          newRole: Number((e.target as HTMLSelectElement).value) as AccessCode,
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
      const _data = await this.api.fetch(`/orgs/${this.orgId}/invite`, {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail,
          role: Number(role),
        }),
      });

      this.notify.toast({
        message: msg(str`Successfully invited ${inviteEmail}.`),
        variant: "success",
        icon: "check2-circle",
        id: "user-updated-status",
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
        id: "user-updated-status",
      });
    }

    this.isSubmittingInvite = false;
  }

  private async removeInvite(invite: Invite) {
    try {
      await this.api.fetch(`/orgs/${this.orgId}/invites/delete`, {
        method: "POST",
        body: JSON.stringify({
          email: invite.email,
        }),
      });

      this.notify.toast({
        message: msg(
          str`Successfully removed ${invite.email} from ${this.userOrg?.name}.`,
        ),
        variant: "success",
        icon: "check2-circle",
        id: "user-updated-status",
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
        id: "user-updated-status",
      });
    }
  }

  private async renameOrg({ name, slug }: { name: string; slug: string }) {
    try {
      await this.api.fetch(`/orgs/${this.orgId}/rename`, {
        method: "POST",
        body: JSON.stringify({ name, slug }),
      });

      const user = await this.getCurrentUser();

      AppStateService.updateUser(formatAPIUser(user), slug);

      this.navigate.to(`${this.navigate.orgBasePath}/settings`);

      this.notify.toast({
        message: msg("Org successfully updated."),
        variant: "success",
        icon: "check2-circle",
        id: "org-update-status",
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
        id: "org-update-status",
      });
    }
  }

  private async getCurrentUser(): Promise<APIUser> {
    return this.api.fetch("/users/me");
  }

  /**
   * Stop propgation of sl-tooltip events.
   * Prevents bug where sl-dialog closes when tooltip closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: Event) {
    e.stopPropagation();
  }
}
