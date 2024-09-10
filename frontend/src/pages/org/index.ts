import { localized, msg, str } from "@lit/localize";
import { nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { choose } from "lit/directives/choose.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import isEqual from "lodash/fp/isEqual";

import type { QATab } from "./archived-item-qa/types";
import type { Tab as CollectionTab } from "./collection-detail";
import type {
  Member,
  OrgRemoveMemberEvent,
  UserRoleChangeEvent,
} from "./settings/settings";

import type { QuotaUpdateDetail } from "@/controllers/api";
import needLogin from "@/decorators/needLogin";
import type { CollectionSavedEvent } from "@/features/collections/collection-metadata-dialog";
import type { SelectJobTypeEvent } from "@/features/crawl-workflows/new-workflow-dialog";
import type { UserOrg } from "@/types/user";
import { isApiError } from "@/utils/api";
import type { ViewState } from "@/utils/APIRouter";
import { DEFAULT_MAX_SCALE } from "@/utils/crawler";
import LiteElement, { html } from "@/utils/LiteElement";
import { type OrgData } from "@/utils/orgs";
import { AppStateService } from "@/utils/state";
import type { FormState as WorkflowFormState } from "@/utils/workflow";

import "./workflow-detail";
import "./workflows-list";
import "./archived-item-detail";
import "./archived-items";
import "./collections-list";
import "./collection-detail";
import "./browser-profiles-detail";
import "./browser-profiles-list";
import "./settings/settings";
import "./dashboard";

import(/* webpackChunkName: "org" */ "./archived-item-qa/archived-item-qa");
import(/* webpackChunkName: "org" */ "./workflows-new");
import(/* webpackChunkName: "org" */ "./browser-profiles-new");

const RESOURCE_NAMES = ["workflow", "collection", "browser-profile", "upload"];
type ResourceName = (typeof RESOURCE_NAMES)[number];
export type SelectNewDialogEvent = CustomEvent<ResourceName>;
type ArchivedItemPageParams = {
  itemId?: string;
  workflowId?: string;
  collectionId?: string;
};
export type OrgParams = {
  home: Record<string, never>;
  workflows: ArchivedItemPageParams & {
    scopeType?: WorkflowFormState["scopeType"];
    new?: ResourceName;
    itemPageId?: string;
    qaTab?: QATab;
    qaRunId?: string;
  };
  items: ArchivedItemPageParams & {
    itemType?: string;
  };
  "browser-profiles": {
    browserProfileId?: string;
    browserId?: string;
    new?: ResourceName;
    name?: string;
    url?: string;
    description?: string;
    crawlerChannel?: string;
    profileId?: string;
    navigateUrl?: string;
  };
  collections: ArchivedItemPageParams & {
    collectionTab?: string;
  };
  settings: {
    settingsTab?: "information" | "members";
  };
};
export type OrgTab = keyof OrgParams;

const defaultTab = "home";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

@localized()
@customElement("btrix-org")
@needLogin
export class Org extends LiteElement {
  @property({ type: Object })
  viewStateData?: ViewState["data"];

  // Path after `/orgs/:orgId/`
  @property({ type: String })
  orgPath!: string;

  @property({ type: Object })
  params: OrgParams[OrgTab] = {};

  @property({ type: String })
  orgTab: OrgTab = defaultTab;

  @property({ type: Number })
  maxScale: number = DEFAULT_MAX_SCALE;

  @state()
  private openDialogName?: ResourceName;

  @state()
  private isCreateDialogVisible = false;

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener(
      "btrix-execution-minutes-quota-update",
      this.onExecutionMinutesQuotaUpdate,
    );
    this.addEventListener(
      "btrix-storage-quota-update",
      this.onStorageQuotaUpdate,
    );
  }

  disconnectedCallback() {
    this.removeEventListener(
      "btrix-execution-minutes-quota-update",
      this.onExecutionMinutesQuotaUpdate,
    );
    this.removeEventListener(
      "btrix-storage-quota-update",
      this.onStorageQuotaUpdate,
    );
    super.disconnectedCallback();
  }

  async willUpdate(changedProperties: Map<string, unknown>) {
    if (
      changedProperties.has("appState.orgSlug") &&
      this.userInfo &&
      this.orgSlug
    ) {
      if (this.userOrg) {
        void this.updateOrg();
      } else {
        // Couldn't find org with slug, redirect to first org
        const org = this.userInfo.orgs[0] as UserOrg | undefined;
        if (org) {
          this.navTo(`/orgs/${org.slug}`);
        } else {
          this.navTo(`/account/settings`);
        }

        return;
      }
    } else if (changedProperties.has("orgTab") && this.orgId) {
      // Get most up to date org data
      void this.updateOrg();
    }
    if (changedProperties.has("openDialogName")) {
      // Sync URL to create dialog
      const url = new URL(window.location.href);
      if (this.openDialogName) {
        if (url.searchParams.get("new") !== this.openDialogName) {
          url.searchParams.set("new", this.openDialogName);
          this.navTo(`${url.pathname}${url.search}`);
        }
      } else {
        const prevOpenDialogName = changedProperties.get("openDialogName");
        if (
          prevOpenDialogName &&
          prevOpenDialogName === url.searchParams.get("new")
        ) {
          url.searchParams.delete("new");
          this.navTo(`${url.pathname}${url.search}`);
        }
      }
    } else if (changedProperties.has("params")) {
      const dialogName = this.getDialogName();
      if (dialogName && !this.openDialogName) {
        this.openDialog(dialogName);
      }
    }
  }

  private async updateOrg(e?: CustomEvent) {
    if (e) {
      e.stopPropagation();
    }

    if (!this.userInfo || !this.orgId) return;
    try {
      const org = await this.getOrg(this.orgId);

      if (!isEqual(this.org, org)) {
        AppStateService.updateOrg(org);
      }
    } catch (e) {
      console.debug(e);
      this.notify({
        message: msg("Sorry, couldn't retrieve organization at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  async firstUpdated() {
    // if slug is actually an orgId (UUID), attempt to lookup the slug
    // and redirect to the slug url
    if (this.orgSlug && UUID_REGEX.test(this.orgSlug)) {
      const org = await this.getOrg(this.orgSlug);
      const actualSlug = org?.slug;
      if (actualSlug) {
        this.navTo(
          window.location.href
            .slice(window.location.origin.length)
            .replace(this.orgSlug, actualSlug),
        );
        return;
      }
    }
    // Sync URL to create dialog
    const dialogName = this.getDialogName();
    if (dialogName) this.openDialog(dialogName);
  }

  private getDialogName() {
    const url = new URL(window.location.href);
    return url.searchParams.get("new");
  }

  private openDialog(dialogName: string) {
    if (dialogName && RESOURCE_NAMES.includes(dialogName)) {
      this.openDialogName = dialogName;
      this.isCreateDialogVisible = true;
    }
  }

  render() {
    const noMaxWidth = (this.params as OrgParams["workflows"]).qaTab;

    return html`
      <btrix-document-title
        title=${ifDefined(this.userOrg?.name)}
      ></btrix-document-title>

      <div class="flex min-h-full flex-col">
        <btrix-org-status-banner></btrix-org-status-banner>
        ${this.renderOrgNavBar()}
        <main
          class="${noMaxWidth
            ? "w-full"
            : "w-full max-w-screen-desktop"} mx-auto box-border flex flex-1 flex-col p-3"
          aria-labelledby="${this.orgTab}-tab"
        >
          ${when(this.userOrg, (userOrg) =>
            choose(
              this.orgTab,
              [
                ["home", this.renderDashboard],
                [
                  "items",
                  () => html`
                    <btrix-document-title
                      title=${`${msg("Archived Items")} - ${userOrg.name}`}
                    ></btrix-document-title>
                    ${this.renderArchivedItem()}
                  `,
                ],
                [
                  "workflows",
                  () => html`
                    <btrix-document-title
                      title=${`${msg("Crawl Workflows")} - ${userOrg.name}`}
                    ></btrix-document-title>
                    ${this.renderWorkflows()}
                  `,
                ],
                [
                  "browser-profiles",
                  () => html`
                    <btrix-document-title
                      title=${`${msg("Browser Profiles")} - ${userOrg.name}`}
                    ></btrix-document-title>
                    ${this.renderBrowserProfiles()}
                  `,
                ],
                [
                  "collections",
                  () => html`
                    <btrix-document-title
                      title=${`${msg("Collections")} - ${userOrg.name}`}
                    ></btrix-document-title>
                    ${this.renderCollections()}
                  `,
                ],
                [
                  "settings",
                  () =>
                    this.appState.isAdmin
                      ? html`
                          <btrix-document-title
                            title=${`${msg("Org Settings")} - ${userOrg.name}`}
                          ></btrix-document-title>
                          ${this.renderOrgSettings()}
                        `
                      : nothing,
                ],
              ],
              () =>
                html`<btrix-not-found
                  class="flex items-center justify-center"
                ></btrix-not-found>`,
            ),
          )}
        </main>
        ${this.renderNewResourceDialogs()}
      </div>
    `;
  }

  private renderOrgNavBar() {
    return html`
      <div
        class="mx-auto box-border w-full overflow-x-hidden overscroll-contain"
      >
        <nav class="-mx-3 flex items-end overflow-x-auto px-3 xl:px-6">
          ${this.renderNavTab({
            tabName: "home",
            label: msg("Overview"),
            path: "",
          })}
          ${this.renderNavTab({
            tabName: "workflows",
            label: msg("Crawling"),
            path: "workflows",
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
          ${when(this.appState.isCrawler, () =>
            this.renderNavTab({
              tabName: "browser-profiles",
              label: msg("Browser Profiles"),
              path: "browser-profiles",
            }),
          )}
          ${when(this.appState.isAdmin || this.userInfo?.isSuperAdmin, () =>
            this.renderNavTab({
              tabName: "settings",
              label: msg("Settings"),
              path: "settings",
            }),
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
        class="block flex-shrink-0 rounded-t px-3 transition-colors hover:bg-neutral-50"
        href=${`${this.orgBasePath}${path ? `/${path}` : ""}`}
        aria-selected=${isActive}
        @click=${this.navLink}
      >
        <div
          class="${isActive
            ? "border-primary text-primary"
            : "border-transparent text-neutral-500 hover:border-neutral-100 hover:text-neutral-900"} border-b-2 py-3 text-sm font-medium transition-colors"
        >
          ${label}
        </div>
      </a>
    `;
  }

  private renderNewResourceDialogs() {
    if (!this.orgId || !this.appState.isCrawler) {
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
          ?open=${this.openDialogName === "upload"}
          @request-close=${() => (this.openDialogName = undefined)}
          @uploaded=${() => {
            if (this.orgTab === "home") {
              this.navTo(`${this.orgBasePath}/items/upload`);
            }
          }}
        ></btrix-file-uploader>
        <btrix-new-browser-profile-dialog
          ?open=${this.openDialogName === "browser-profile"}
          @sl-hide=${() => (this.openDialogName = undefined)}
        >
        </btrix-new-browser-profile-dialog>
        <btrix-new-workflow-dialog
          ?open=${this.openDialogName === "workflow"}
          @sl-hide=${() => (this.openDialogName = undefined)}
          @select-job-type=${(e: SelectJobTypeEvent) => {
            this.openDialogName = undefined;
            this.navTo(
              `${this.orgBasePath}/workflows/new?scopeType=${e.detail}`,
            );
          }}
        >
        </btrix-new-workflow-dialog>
        <btrix-collection-metadata-dialog
          ?open=${this.openDialogName === "collection"}
          @sl-hide=${() => (this.openDialogName = undefined)}
          @btrix-collection-saved=${(e: CollectionSavedEvent) => {
            this.navTo(
              `${this.orgBasePath}/collections/view/${e.detail.id}/items`,
            );
          }}
        >
        </btrix-collection-metadata-dialog>
      </div>
    `;
  }

  private readonly renderDashboard = () => {
    return html`
      <btrix-dashboard
        ?isCrawler=${this.appState.isCrawler}
        ?isAdmin=${this.appState.isAdmin}
        @select-new-dialog=${this.onSelectNewDialog}
      ></btrix-dashboard>
    `;
  };

  private readonly renderArchivedItem = () => {
    const params = this.params as OrgParams["items"];

    if (params.itemId) {
      return html` <btrix-archived-item-detail
        itemId=${params.itemId}
        collectionId=${params.collectionId || ""}
        workflowId=${params.workflowId || ""}
        itemType=${params.itemType || "crawl"}
        ?isCrawler=${this.appState.isCrawler}
      ></btrix-archived-item-detail>`;
    }

    return html`<btrix-archived-items
      ?isCrawler=${this.appState.isCrawler}
      itemType=${ifDefined(params.itemType || undefined)}
      @select-new-dialog=${this.onSelectNewDialog}
    ></btrix-archived-items>`;
  };

  private readonly renderWorkflows = () => {
    const params = this.params as OrgParams["workflows"];
    const isEditing = Object.prototype.hasOwnProperty.call(params, "edit");
    const workflowId = params.workflowId;

    if (workflowId) {
      if (params.itemId) {
        if (params.qaTab) {
          if (!this.appState.isCrawler) {
            return html`<btrix-not-found
              class="flex items-center justify-center"
            ></btrix-not-found>`;
          }

          return html`<btrix-archived-item-qa
            class="flex-1"
            workflowId=${workflowId}
            itemId=${params.itemId}
            itemPageId=${ifDefined(params.itemPageId)}
            qaRunId=${ifDefined(params.qaRunId)}
            tab=${params.qaTab}
          ></btrix-archived-item-qa>`;
        }

        return html` <btrix-archived-item-detail
          itemId=${params.itemId}
          collectionId=${params.collectionId || ""}
          workflowId=${workflowId}
          itemType="crawl"
          ?isCrawler=${this.appState.isCrawler}
        ></btrix-archived-item-detail>`;
      }

      return html`
        <btrix-workflow-detail
          class="col-span-5"
          workflowId=${workflowId}
          openDialogName=${this.viewStateData?.dialog}
          ?isEditing=${isEditing}
          ?isCrawler=${this.appState.isCrawler}
          .maxScale=${this.maxScale}
        ></btrix-workflow-detail>
      `;
    }

    if (this.orgPath.startsWith("/workflows/new")) {
      const { workflow, seeds } = this.viewStateData || {};

      return html` <btrix-workflows-new
        class="col-span-5"
        ?isCrawler=${this.appState.isCrawler}
        .initialWorkflow=${workflow}
        .initialSeeds=${seeds}
        scopeType=${ifDefined(params.scopeType)}
        @select-new-dialog=${this.onSelectNewDialog}
      ></btrix-workflows-new>`;
    }

    return html`<btrix-workflows-list
      @select-new-dialog=${this.onSelectNewDialog}
      @select-job-type=${(e: SelectJobTypeEvent) => {
        this.openDialogName = undefined;
        this.navTo(`${this.orgBasePath}/workflows/new?scopeType=${e.detail}`);
      }}
    ></btrix-workflows-list>`;
  };

  private readonly renderBrowserProfiles = () => {
    const params = this.params as OrgParams["browser-profiles"];

    if (params.browserProfileId) {
      return html`<btrix-browser-profiles-detail
        profileId=${params.browserProfileId}
        ?isCrawler=${this.appState.isCrawler}
      ></btrix-browser-profiles-detail>`;
    }

    if (params.browserId) {
      return html`<btrix-browser-profiles-new
        .browserId=${params.browserId}
        .browserParams=${{
          name: params.name || "",
          url: params.url || "",
          description: params.description,
          crawlerChannel: params.crawlerChannel,
          profileId: params.profileId,
          navigateUrl: params.navigateUrl,
        }}
      ></btrix-browser-profiles-new>`;
    }

    return html`<btrix-browser-profiles-list
      ?isCrawler=${this.appState.isCrawler}
      @select-new-dialog=${this.onSelectNewDialog}
    ></btrix-browser-profiles-list>`;
  };

  private readonly renderCollections = () => {
    const params = this.params as OrgParams["collections"];

    if (params.collectionId) {
      return html`<btrix-collection-detail
        collectionId=${params.collectionId}
        collectionTab=${(params.collectionTab as CollectionTab | undefined) ||
        "replay"}
        ?isCrawler=${this.appState.isCrawler}
      ></btrix-collection-detail>`;
    }

    return html`<btrix-collections-list
      ?isCrawler=${this.appState.isCrawler}
      @select-new-dialog=${this.onSelectNewDialog}
    ></btrix-collections-list>`;
  };

  private readonly renderOrgSettings = () => {
    const params = this.params as OrgParams["settings"];
    const activePanel = params.settingsTab || "information";
    const isAddingMember = Object.prototype.hasOwnProperty.call(
      this.params,
      "invite",
    );

    return html`<btrix-org-settings
      activePanel=${activePanel}
      ?isAddingMember=${isAddingMember}
      @org-user-role-change=${this.onUserRoleChange}
      @org-remove-member=${this.onOrgRemoveMember}
    ></btrix-org-settings>`;
  };

  private async onSelectNewDialog(e: SelectNewDialogEvent) {
    e.stopPropagation();
    this.isCreateDialogVisible = true;
    await this.updateComplete;
    this.openDialogName = e.detail;
  }

  private async getOrg(orgId: string): Promise<OrgData | undefined> {
    const data = await this.apiFetch<OrgData>(`/orgs/${orgId}`);

    return data;
  }

  private async onOrgRemoveMember(e: OrgRemoveMemberEvent) {
    void this.removeMember(e.detail.member);
  }

  private async onStorageQuotaUpdate(e: CustomEvent<QuotaUpdateDetail>) {
    e.stopPropagation();

    const { reached } = e.detail;

    AppStateService.partialUpdateOrg({
      id: this.orgId,
      storageQuotaReached: reached,
    });
  }

  private async onExecutionMinutesQuotaUpdate(
    e: CustomEvent<QuotaUpdateDetail>,
  ) {
    e.stopPropagation();

    const { reached } = e.detail;

    AppStateService.partialUpdateOrg({
      id: this.orgId,
      execMinutesQuotaReached: reached,
    });
  }

  private async onUserRoleChange(e: UserRoleChangeEvent) {
    const { user, newRole } = e.detail;

    try {
      await this.apiFetch(`/orgs/${this.orgId}/user-role`, {
        method: "PATCH",
        body: JSON.stringify({
          email: user.email,
          role: newRole,
        }),
      });

      this.notify({
        message: msg(
          str`Successfully updated role for ${user.name || user.email}.`,
        ),
        variant: "success",
        icon: "check2-circle",
      });
      const org = await this.getOrg(this.orgId);

      AppStateService.updateOrg(org);
    } catch (e) {
      console.debug(e);

      this.notify({
        message: isApiError(e)
          ? e.message
          : msg(
              str`Sorry, couldn't update role for ${
                user.name || user.email
              } at this time.`,
            ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async removeMember(member: Member) {
    if (!this.userOrg) return;

    const isSelf = member.email === this.userInfo!.email;
    if (
      isSelf &&
      !window.confirm(
        msg(
          str`Are you sure you want to remove yourself from ${this.userOrg.name}?`,
        ),
      )
    ) {
      return;
    }

    try {
      await this.apiFetch(`/orgs/${this.orgId}/remove`, {
        method: "POST",
        body: JSON.stringify({
          email: member.email,
        }),
      });

      this.notify({
        message: msg(
          str`Successfully removed ${member.name || member.email} from ${
            this.userOrg.name
          }.`,
        ),
        variant: "success",
        icon: "check2-circle",
      });
      if (isSelf) {
        // FIXME better UX, this is the only page currently that doesn't require org...
        this.navTo("/account/settings");
      } else {
        const org = await this.getOrg(this.orgId);

        AppStateService.updateOrg(org);
      }
    } catch (e) {
      console.debug(e);

      this.notify({
        message: isApiError(e)
          ? e.message
          : msg(
              str`Sorry, couldn't remove ${
                member.name || member.email
              } at this time.`,
            ),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }
}
