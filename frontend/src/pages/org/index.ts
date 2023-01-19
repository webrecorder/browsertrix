import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import { serialize } from "@shoelace-style/shoelace/dist/utilities/form.js";

import type { ViewState } from "../../utils/APIRouter";
import type { AuthState } from "../../utils/AuthService";
import type { CurrentUser } from "../../types/user";
import type { OrgData } from "../../utils/orgs";
import LiteElement, { html } from "../../utils/LiteElement";
import { needLogin } from "../../utils/auth";
import { isOwner, AccessCode } from "../../utils/orgs";
import "./crawl-configs-detail";
import "./crawl-configs-list";
import "./crawl-configs-new";
import "./crawl-detail";
import "./crawls-list";
import "./browser-profiles-detail";
import "./browser-profiles-list";
import "./browser-profiles-new";
import { SlButton } from "@shoelace-style/shoelace";

export type OrgTab =
  | "crawls"
  | "crawl-configs"
  | "browser-profiles"
  | "settings";

const defaultTab = "crawls";

@needLogin
@localized()
export class Org extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: Object })
  viewStateData?: ViewState["data"];

  @property({ type: String })
  orgId?: string;

  @property({ type: String })
  orgTab: OrgTab = defaultTab;

  @property({ type: String })
  browserProfileId?: string;

  @property({ type: String })
  browserId?: string;

  @property({ type: String })
  crawlId?: string;

  @property({ type: String })
  crawlConfigId?: string;

  @property({ type: Boolean })
  isAddingMember: boolean = false;

  @property({ type: Boolean })
  isEditing: boolean = false;

  /** Whether new resource is being added in tab */
  @property({ type: Boolean })
  isNewResourceTab: boolean = false;

  @state()
  private org?: OrgData | null;

  @state()
  private successfullyInvitedEmail?: string;

  @state()
  private isEditingOrgName = false;

  async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId") && this.orgId) {
      try {
        const org = await this.getOrg(this.orgId);

        if (!org) {
          this.navTo("/orgs");
        } else {
          this.org = org;
        }
      } catch {
        this.org = null;

        this.notify({
          message: msg("Sorry, couldn't retrieve organization at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
    if (changedProperties.has("isAddingMember") && this.isAddingMember) {
      this.successfullyInvitedEmail = undefined;
    }
  }

  render() {
    if (this.org === null) {
      // TODO handle 404 and 500s
      return "";
    }

    if (!this.org) {
      return html`
        <div
          class="absolute top-1/2 left-1/2 -mt-4 -ml-4"
          style="font-size: 2rem"
        >
          <sl-spinner></sl-spinner>
        </div>
      `;
    }

    let tabPanelContent = "" as any;

    switch (this.orgTab) {
      case "crawls":
        tabPanelContent = this.renderCrawls();
        break;
      case "crawl-configs":
        tabPanelContent = this.renderCrawlTemplates();
        break;
      case "browser-profiles":
        tabPanelContent = this.renderBrowserProfiles();
        break;
      case "settings":
        if (this.isAddingMember) {
          tabPanelContent = this.renderAddMember();
        } else {
          tabPanelContent = this.renderOrgSettings();
        }
        break;
      default:
        tabPanelContent = html`<btrix-not-found
          class="flex items-center justify-center"
        ></btrix-not-found>`;
        break;
    }

    return html`
      <main>
        <div
          class="w-full max-w-screen-lg mx-auto px-3 box-border py-5"
          aria-labelledby="${this.orgTab}-tab"
        >
          ${tabPanelContent}
        </div>
      </main>
    `;
  }

  private renderCrawls() {
    const crawlsBaseUrl = `/orgs/${this.orgId}/crawls`;

    if (this.crawlId) {
      return html` <btrix-crawl-detail
        .authState=${this.authState!}
        crawlId=${this.crawlId}
        crawlsBaseUrl=${crawlsBaseUrl}
      ></btrix-crawl-detail>`;
    }

    return html`<btrix-crawls-list
      .authState=${this.authState!}
      userId=${this.userInfo!.id}
      crawlsBaseUrl=${crawlsBaseUrl}
      ?shouldFetch=${this.orgTab === "crawls"}
    ></btrix-crawls-list>`;
  }

  private renderCrawlTemplates() {
    if (this.crawlConfigId) {
      return html`
        <btrix-crawl-configs-detail
          class="col-span-5 mt-6"
          .authState=${this.authState!}
          .orgId=${this.orgId!}
          .crawlConfigId=${this.crawlConfigId}
          .isEditing=${this.isEditing}
        ></btrix-crawl-configs-detail>
      `;
    }

    if (this.isNewResourceTab) {
      const crawlTemplate = this.viewStateData?.crawlTemplate;

      return html` <btrix-crawl-configs-new
        class="col-span-5 mt-6"
        .authState=${this.authState!}
        .orgId=${this.orgId!}
        .initialCrawlTemplate=${crawlTemplate}
      ></btrix-crawl-configs-new>`;
    }

    return html`<btrix-crawl-configs-list
      .authState=${this.authState!}
      .orgId=${this.orgId!}
      userId=${this.userInfo!.id}
    ></btrix-crawl-configs-list>`;
  }

  private renderBrowserProfiles() {
    if (this.browserProfileId) {
      return html`<btrix-browser-profiles-detail
        .authState=${this.authState!}
        .orgId=${this.orgId!}
        profileId=${this.browserProfileId}
      ></btrix-browser-profiles-detail>`;
    }

    if (this.browserId) {
      return html`<btrix-browser-profiles-new
        .authState=${this.authState!}
        .orgId=${this.orgId!}
        .browserId=${this.browserId}
      ></btrix-browser-profiles-new>`;
    }

    return html`<btrix-browser-profiles-list
      .authState=${this.authState!}
      .orgId=${this.orgId!}
      ?showCreateDialog=${this.isNewResourceTab}
    ></btrix-browser-profiles-list>`;
  }

  private renderOrgSettings() {
    return html`<btrix-section-heading
        >${msg("Org Information")}</btrix-section-heading
      >
      <section class="mt-5 mb-10">${this.renderOrgName()}</section>
      <btrix-section-heading>${msg("Org Members")}</btrix-section-heading>
      <section class="mt-5">${this.renderMembers()}</section>`;
  }

  private renderOrgName() {
    if (!this.org || !this.userInfo) return;
    const memberInfo = (this.org.users ?? {})[this.userInfo.id];
    if (!memberInfo || !isOwner(memberInfo.role)) {
      return html`
        <sl-input
          label=${msg("Org Name")}
          value=${this.org.name}
          readonly
        ></sl-input>
      `;
    }

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
              <sl-button type="submit" variant="primary"
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
    if (!this.org!.users) return;

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
          href=${`/orgs/${this.orgId}/members/add-member`}
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
          ${Object.entries(this.org!.users).map(
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
          href=${`/orgs/${this.orgId}/members`}
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
          @cancel=${() => this.navTo(`/orgs/${this.orgId}/members`)}
          .authState=${this.authState}
          .orgId=${this.orgId}
        ></btrix-org-invite-form>
      </div>
    `;
  }

  async getOrg(orgId: string): Promise<OrgData> {
    const data = await this.apiFetch(`/orgs/${orgId}`, this.authState!);

    return data;
  }

  private async onOrgNameSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!this.org) return;
    const { orgName } = serialize(e.target as HTMLFormElement);

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
    } catch (e) {
      console.debug(e);
      this.notify({
        message: msg("Sorry, couldn't update organization name at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isEditingOrgName = false;
  }

  onInviteSuccess(
    event: CustomEvent<{ inviteEmail: string; isExistingUser: boolean }>
  ) {
    this.successfullyInvitedEmail = event.detail.inviteEmail;

    this.navTo(`/orgs/${this.orgId}/members`);
  }

  updateUrl(event: CustomEvent<{ name: OrgTab }>) {
    this.navTo(`/orgs/${this.orgId}/${event.detail.name}`);
  }
}
