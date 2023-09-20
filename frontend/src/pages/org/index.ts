import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { when } from "lit/directives/when.js";
import { ifDefined } from "lit/directives/if-defined.js";

import type { ViewState } from "../../utils/APIRouter";
import type { AuthState } from "../../utils/AuthService";
import type { CurrentUser } from "../../types/user";
import type { Crawl, JobType } from "../../types/crawler";
import type { OrgData } from "../../utils/orgs";
import { isAdmin, isCrawler } from "../../utils/orgs";
import LiteElement, { html } from "../../utils/LiteElement";
import { needLogin } from "../../utils/auth";
import "./workflow-detail";
import "./workflows-list";
import "./workflows-new";
import "./crawl-detail";
import "./crawls-list";
import "./collections-list";
import "./collections-new";
import "./collection-edit";
import "./collection-detail";
import "./browser-profiles-detail";
import "./browser-profiles-list";
import "./browser-profiles-new";
import "./settings";
import "./dashboard";
import "./components/file-uploader";
import "./components/new-browser-profile-dialog";
import "./components/new-collection-dialog";
import "./components/new-workflow-dialog";
import type {
  Member,
  OrgNameChangeEvent,
  UserRoleChangeEvent,
  OrgRemoveMemberEvent,
} from "./settings";
import type { Tab as CollectionTab } from "./collection-detail";
import type { SelectJobTypeEvent } from "./components/new-workflow-dialog";

type ResourceName = "workflow" | "collection" | "browser-profile" | "upload";
export type SelectNewDialogEvent = CustomEvent<ResourceName>;
export type OrgTab =
  | "home"
  | "crawls"
  | "workflows"
  | "items"
  | "browser-profiles"
  | "collections"
  | "settings";

type Params = {
  workflowId?: string;
  browserProfileId?: string;
  browserId?: string;
  itemId?: string;
  collectionId?: string;
  collectionTab?: string;
  itemType?: Crawl["type"];
  jobType?: JobType;
  new?: ResourceName;
};
const defaultTab = "home";

@needLogin
@localized()
export class Org extends LiteElement {
  @property({ type: Object })
  authState?: AuthState;

  @property({ type: Object })
  userInfo?: CurrentUser;

  @property({ type: Object })
  viewStateData?: ViewState["data"];

  // Path after `/orgs/:orgId/`
  @property({ type: String })
  orgPath!: string;

  @property({ type: Object })
  params!: Params;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  orgTab: OrgTab = defaultTab;

  @state()
  private orgStorageQuotaReached = false;

  @state()
  private showStorageQuotaAlert = false;

  @state()
  private openDialogName?:
    | "workflow"
    | "collection"
    | "browser-profile"
    | "upload";

  @state()
  private isCreateDialogVisible = false;

  @state()
  private org?: OrgData | null;

  @state()
  private isSavingOrgName = false;

  get userOrg() {
    if (!this.userInfo) return null;
    return this.userInfo.orgs.find(({ id }) => id === this.orgId)!;
  }

  get isAdmin() {
    const userOrg = this.userOrg;
    if (userOrg) return isAdmin(userOrg.role);
    return false;
  }

  get isCrawler() {
    const userOrg = this.userOrg;
    if (userOrg) return isCrawler(userOrg.role);
    return false;
  }

  async willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("orgId") && this.orgId) {
      try {
        this.org = await this.getOrg(this.orgId);
        this.checkStorageQuota();
      } catch {
        this.org = null;

        this.notify({
          message: msg("Sorry, couldn't retrieve organization at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
        });
      }
    }
  }

  render() {
    if (this.org === null) {
      // TODO handle 404 and 500s
      return "";
    }

    if (!this.org || !this.userInfo) {
      // TODO combine loading state with tab panel content
      return "";
    }

    let tabPanelContent = "" as any;

    switch (this.orgTab) {
      case "home":
        tabPanelContent = this.renderDashboard();
        break;
      case "items":
        tabPanelContent = this.renderArchive();
        break;
      case "workflows":
        tabPanelContent = this.renderWorkflows();
        break;
      case "browser-profiles":
        tabPanelContent = this.renderBrowserProfiles();
        break;
      case "collections":
        tabPanelContent = this.renderCollections();
        break;
      case "settings": {
        if (this.isAdmin) {
          tabPanelContent = this.renderOrgSettings();
          break;
        }
      }
      default:
        tabPanelContent = html`<btrix-not-found
          class="flex items-center justify-center"
        ></btrix-not-found>`;
        break;
    }

    return html`
      ${this.renderStorageAlert()} ${this.renderOrgNavBar()}
      <main>
        <div
          class="w-full max-w-screen-lg mx-auto px-3 box-border py-7"
          aria-labelledby="${this.orgTab}-tab"
        >
          ${tabPanelContent}
        </div>
      </main>
      ${this.renderNewResourceDialogs()}
    `;
  }

  private renderStorageAlert() {
    return html`
      <div
        class="transition-all ${this.showStorageQuotaAlert
          ? "bg-slate-100 border-b py-5"
          : ""}"
      >
        <div class="w-full max-w-screen-lg mx-auto px-3 box-border">
          <sl-alert
            variant="warning"
            closable
            ?open=${this.showStorageQuotaAlert}
            @sl-after-hide=${() => (this.showStorageQuotaAlert = false)}
          >
            <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
            <strong>${msg("Your org has reached its storage limit")}</strong
            ><br />
            ${msg(
              "To add archived items again, delete unneeded items and unused browser profiles to free up space, or contact us to upgrade your storage plan."
            )}
          </sl-alert>
        </div>
      </div>
    `;
  }

  private renderOrgNavBar() {
    return html`
      <div class="w-full max-w-screen-lg mx-auto px-3 box-border">
        <nav class="-ml-3 flex items-end overflow-x-auto">
          ${this.renderNavTab({
            tabName: "home",
            label: msg("Overview"),
            path: "",
          })}
          ${this.renderNavTab({
            tabName: "workflows",
            label: msg("Crawling"),
            path: "workflows/crawls",
          })}
          ${this.renderNavTab({
            tabName: "items",
            label: msg("Archived Items"),
            path: "items",
          })}
          ${this.renderNavTab({
            tabName: "collections",
            label: msg("Collections"),
            path: "collections",
          })}
          ${when(this.isCrawler, () =>
            this.renderNavTab({
              tabName: "browser-profiles",
              label: msg("Browser Profiles"),
              path: "browser-profiles",
            })
          )}
          ${when(this.isAdmin || this.userInfo?.isAdmin, () =>
            this.renderNavTab({
              tabName: "settings",
              label: msg("Org Settings"),
              path: "settings",
            })
          )}
        </nav>
      </div>

      <hr />
    `;
  }

  private renderNavTab({
    tabName,
    label,
    path,
  }: {
    tabName: OrgTab;
    label: string;
    path: string;
  }) {
    const isActive = this.orgTab === tabName;

    return html`
      <a
        id="${tabName}-tab"
        class="block flex-shrink-0 px-3 hover:bg-neutral-50 rounded-t transition-colors"
        href=${`/orgs/${this.orgId}${path ? `/${path}` : ""}`}
        aria-selected=${isActive}
        @click=${this.navLink}
      >
        <div
          class="text-sm font-medium py-3 border-b-2 transition-colors ${isActive
            ? "border-primary text-primary"
            : "border-transparent text-neutral-500 hover:border-neutral-100 hover:text-neutral-900"}"
        >
          ${label}
        </div>
      </a>
    `;
  }

  private renderNewResourceDialogs() {
    if (!this.authState || !this.orgId || !this.isCrawler) {
      return;
    }
    if (!this.isCreateDialogVisible) {
      return;
    }
    return html`
      <div
        @sl-hide=${(e: CustomEvent) => {
          e.stopPropagation();
          this.openDialogName = undefined;
        }}
        @sl-after-hide=${(e: CustomEvent) => {
          e.stopPropagation();
          this.isCreateDialogVisible = false;
        }}
      >
        <btrix-file-uploader
          orgId=${this.orgId}
          .authState=${this.authState}
          ?open=${this.openDialogName === "upload"}
          @request-close=${() => (this.openDialogName = undefined)}
          @uploaded=${() => {
            if (this.orgTab === "home") {
              this.navTo(`/orgs/${this.orgId}/items/upload`);
            }
          }}
        ></btrix-file-uploader>
        <btrix-new-browser-profile-dialog
          .authState=${this.authState}
          orgId=${this.orgId}
          ?open=${this.openDialogName === "browser-profile"}
        >
        </btrix-new-browser-profile-dialog>
        <btrix-new-workflow-dialog
          orgId=${this.orgId}
          ?open=${this.openDialogName === "workflow"}
          @select-job-type=${(e: SelectJobTypeEvent) => {
            this.openDialogName = undefined;
            this.navTo(`/orgs/${this.orgId}/workflows?new&jobType=${e.detail}`);
          }}
        >
        </btrix-new-workflow-dialog>
        <btrix-new-collection-dialog
          .authState=${this.authState}
          orgId=${this.orgId}
          ?open=${this.openDialogName === "collection"}
        >
        </btrix-new-collection-dialog>
      </div>
    `;
  }

  private renderDashboard() {
    return html`
      <btrix-dashboard
        .authState=${this.authState!}
        orgId=${this.orgId}
        .org=${this.org || null}
        @select-new-dialog=${this.onSelectNewDialog}
      ></btrix-dashboard>
    `;
  }

  private renderArchive() {
    if (this.params.itemId) {
      return html` <btrix-crawl-detail
        .authState=${this.authState!}
        orgId=${this.orgId}
        crawlId=${this.params.itemId}
        collectionId=${this.params.collectionId || ""}
        workflowId=${this.params.workflowId || ""}
        itemType=${this.params.itemType || "crawl"}
        ?isCrawler=${this.isCrawler}
        @storage-quota-update=${this.onStorageQuotaUpdate}
      ></btrix-crawl-detail>`;
    }

    return html`<btrix-crawls-list
      .authState=${this.authState!}
      userId=${this.userInfo!.id}
      orgId=${this.orgId}
      ?orgStorageQuotaReached=${this.orgStorageQuotaReached}
      ?isCrawler=${this.isCrawler}
      itemType=${ifDefined(this.params.itemType || undefined)}
      @storage-quota-update=${this.onStorageQuotaUpdate}
      @select-new-dialog=${this.onSelectNewDialog}
    ></btrix-crawls-list>`;
  }

  private renderWorkflows() {
    const isEditing = this.params.hasOwnProperty("edit");
    const isNewResourceTab = this.params.hasOwnProperty("new");
    const workflowId = this.params.workflowId;

    if (workflowId) {
      return html`
        <btrix-workflow-detail
          class="col-span-5 mt-6"
          .authState=${this.authState!}
          orgId=${this.orgId!}
          ?orgStorageQuotaReached=${this.orgStorageQuotaReached}
          workflowId=${workflowId}
          openDialogName=${this.viewStateData?.dialog}
          ?isEditing=${isEditing}
          ?isCrawler=${this.isCrawler}
          @storage-quota-update=${this.onStorageQuotaUpdate}
        ></btrix-workflow-detail>
      `;
    }

    if (isNewResourceTab) {
      const workflow = this.viewStateData?.workflow;

      return html` <btrix-workflows-new
        class="col-span-5 mt-6"
        .authState=${this.authState!}
        orgId=${this.orgId!}
        ?isCrawler=${this.isCrawler}
        .initialWorkflow=${workflow}
        jobType=${ifDefined(this.params.jobType)}
        @storage-quota-update=${this.onStorageQuotaUpdate}
        @select-new-dialog=${this.onSelectNewDialog}
      ></btrix-workflows-new>`;
    }

    return html`<btrix-workflows-list
      .authState=${this.authState!}
      orgId=${this.orgId!}
      ?orgStorageQuotaReached=${this.orgStorageQuotaReached}
      userId=${this.userInfo!.id}
      ?isCrawler=${this.isCrawler}
      @storage-quota-update=${this.onStorageQuotaUpdate}
      @select-new-dialog=${this.onSelectNewDialog}
    ></btrix-workflows-list>`;
  }

  private renderBrowserProfiles() {
    if (this.params.browserProfileId) {
      return html`<btrix-browser-profiles-detail
        .authState=${this.authState!}
        .orgId=${this.orgId!}
        profileId=${this.params.browserProfileId}
        @storage-quota-update=${this.onStorageQuotaUpdate}
      ></btrix-browser-profiles-detail>`;
    }

    if (this.params.browserId) {
      return html`<btrix-browser-profiles-new
        .authState=${this.authState!}
        .orgId=${this.orgId!}
        .browserId=${this.params.browserId}
        @storage-quota-update=${this.onStorageQuotaUpdate}
      ></btrix-browser-profiles-new>`;
    }

    return html`<btrix-browser-profiles-list
      .authState=${this.authState!}
      .orgId=${this.orgId!}
      @storage-quota-update=${this.onStorageQuotaUpdate}
      @select-new-dialog=${this.onSelectNewDialog}
    ></btrix-browser-profiles-list>`;
  }

  private renderCollections() {
    if (this.params.collectionId) {
      if (this.orgPath.includes(`/edit/${this.params.collectionId}`)) {
        return html`<btrix-collection-edit
          .authState=${this.authState!}
          orgId=${this.orgId!}
          collectionId=${this.params.collectionId}
          ?isCrawler=${this.isCrawler}
        ></btrix-collection-edit>`;
      }

      return html`<btrix-collection-detail
        .authState=${this.authState!}
        orgId=${this.orgId!}
        collectionId=${this.params.collectionId}
        collectionTab=${(this.params.collectionTab as CollectionTab) ||
        "replay"}
        ?isCrawler=${this.isCrawler}
      ></btrix-collection-detail>`;
    }

    return html`<btrix-collections-list
      .authState=${this.authState!}
      orgId=${this.orgId!}
      ?isCrawler=${this.isCrawler}
      @select-new-dialog=${this.onSelectNewDialog}
    ></btrix-collections-list>`;
  }

  private renderOrgSettings() {
    const activePanel = this.orgPath.includes("/members")
      ? "members"
      : "information";
    const isAddingMember = this.params.hasOwnProperty("invite");

    return html`<btrix-org-settings
      .authState=${this.authState}
      .userInfo=${this.userInfo}
      .org=${this.org}
      .orgId=${this.orgId}
      activePanel=${activePanel}
      ?isAddingMember=${isAddingMember}
      ?isSavingOrgName=${this.isSavingOrgName}
      @org-name-change=${this.onOrgNameChange}
      @org-user-role-change=${this.onUserRoleChange}
      @org-remove-member=${this.onOrgRemoveMember}
    ></btrix-org-settings>`;
  }

  private async onSelectNewDialog(e: SelectNewDialogEvent) {
    e.stopPropagation();
    this.isCreateDialogVisible = true;
    await this.updateComplete;
    this.openDialogName = e.detail;
  }

  private async getOrg(orgId: string): Promise<OrgData> {
    const data = await this.apiFetch(`/orgs/${orgId}`, this.authState!);

    return data;
  }

  private async onOrgNameChange(e: OrgNameChangeEvent) {
    this.isSavingOrgName = true;

    try {
      await this.apiFetch(`/orgs/${this.org!.id}/rename`, this.authState!, {
        method: "POST",
        body: JSON.stringify({ name: e.detail.value }),
      });

      this.notify({
        message: msg("Updated organization name."),
        variant: "success",
        icon: "check2-circle",
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

  private async onOrgRemoveMember(e: OrgRemoveMemberEvent) {
    this.removeMember(e.detail.member);
  }

  private async onStorageQuotaUpdate(e: CustomEvent) {
    e.stopPropagation();
    const { reached } = e.detail;
    this.orgStorageQuotaReached = reached;
    if (reached) {
      this.showStorageQuotaAlert = true;
    }
  }

  private async onUserRoleChange(e: UserRoleChangeEvent) {
    const { user, newRole } = e.detail;

    try {
      await this.apiFetch(`/orgs/${this.orgId}/user-role`, this.authState!, {
        method: "PATCH",
        body: JSON.stringify({
          email: user.email,
          role: newRole,
        }),
      });

      this.notify({
        message: msg(
          str`Successfully updated role for ${user.name || user.email}.`
        ),
        variant: "success",
        icon: "check2-circle",
      });
      this.org = await this.getOrg(this.orgId);
    } catch (e: any) {
      console.debug(e);

      this.notify({
        message: e.isApiError
          ? e.message
          : msg(
              str`Sorry, couldn't update role for ${
                user.name || user.email
              } at this time.`
            ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async removeMember(member: Member) {
    if (!this.org) return;
    const isSelf = member.email === this.userInfo!.email;
    if (
      isSelf &&
      !window.confirm(
        msg(
          str`Are you sure you want to remove yourself from ${this.org.name}?`
        )
      )
    ) {
      return;
    }

    try {
      await this.apiFetch(`/orgs/${this.orgId}/remove`, this.authState!, {
        method: "POST",
        body: JSON.stringify({
          email: member.email,
        }),
      });

      this.notify({
        message: msg(
          str`Successfully removed ${member.name || member.email} from ${
            this.org.name
          }.`
        ),
        variant: "success",
        icon: "check2-circle",
      });
      if (isSelf) {
        // FIXME better UX, this is the only page currently that doesn't require org...
        this.navTo("/account/settings");
      } else {
        this.org = await this.getOrg(this.orgId);
      }
    } catch (e: any) {
      console.debug(e);

      this.notify({
        message: e.isApiError
          ? e.message
          : msg(
              str`Sorry, couldn't remove ${
                member.name || member.email
              } at this time.`
            ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  checkStorageQuota() {
    if (
      !this.org ||
      !this.org.quotas.storageQuota ||
      this.org.quotas.storageQuota == 0
    ) {
      this.orgStorageQuotaReached = false;
      return;
    }

    if (this.org.bytesStored > this.org.quotas.storageQuota) {
      this.orgStorageQuotaReached = true;
    } else {
      this.orgStorageQuotaReached = false;
    }

    if (this.orgStorageQuotaReached) {
      this.showStorageQuotaAlert = true;
    }
  }
}
