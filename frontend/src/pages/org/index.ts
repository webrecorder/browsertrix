import { provide } from "@lit/context";
import { localized, msg, str } from "@lit/localize";
import { html, nothing } from "lit";
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
  UpdateOrgDetail,
  UserRoleChangeEvent,
} from "./settings/settings";

import { BtrixElement } from "@/classes/BtrixElement";
import { proxiesContext, type ProxiesContext } from "@/context/org";
import { SearchOrgContextController } from "@/context/search-org/SearchOrgContextController";
import { searchOrgContextKey } from "@/context/search-org/types";
import type { QuotaUpdateDetail } from "@/controllers/api";
import needLogin from "@/decorators/needLogin";
import type { CollectionSavedEvent } from "@/features/collections/collection-create-dialog";
import type { SelectJobTypeEvent } from "@/features/crawl-workflows/new-workflow-dialog";
import { OrgTab, RouteNamespace, WorkflowTab } from "@/routes";
import type { ProxiesAPIResponse } from "@/types/crawler";
import type { UserOrg } from "@/types/user";
import { isApiError } from "@/utils/api";
import type { ViewState } from "@/utils/APIRouter";
import type { DuplicateWorkflowSettings } from "@/utils/crawl-workflows/settingsForDuplicate";
import { DEFAULT_MAX_SCALE } from "@/utils/crawler";
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
  workflowTab?: WorkflowTab;
  collectionId?: string;
};
export type OrgParams = {
  [OrgTab.Dashboard]: Record<string, never>;
  [OrgTab.Workflows]: ArchivedItemPageParams & {
    scopeType?: WorkflowFormState["scopeType"];
    new?: ResourceName;
    itemPageId?: string;
    qaTab?: QATab;
    qaRunId?: string;
  };
  [OrgTab.Items]: ArchivedItemPageParams & {
    itemType?: string;
    qaTab?: QATab;
  };
  [OrgTab.BrowserProfiles]: {
    browserProfileId?: string;
    browserId?: string;
    new?: ResourceName;
    name?: string;
    url?: string;
    description?: string;
    crawlerChannel?: string;
    profileId?: string;
    navigateUrl?: string;
    proxyId?: string;
  };
  [OrgTab.Collections]: ArchivedItemPageParams & {
    collectionTab?: string;
  };
  [OrgTab.Settings]: {
    settingsTab?: "information" | "members";
  };
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

@customElement("btrix-org")
@localized()
@needLogin
export class Org extends BtrixElement {
  @provide({ context: proxiesContext })
  proxies: ProxiesContext = null;

  @property({ type: Object })
  viewStateData?: ViewState["data"];

  // Path after `/orgs/:orgId/`
  @property({ type: String })
  orgPath!: string;

  @property({ type: Object })
  params: OrgParams[OrgTab] = {};

  @property({ type: String })
  orgTab?: OrgTab | string;

  @property({ type: Number })
  maxBrowserWindows: number = DEFAULT_MAX_SCALE;

  @state()
  private openDialogName?: ResourceName;

  @state()
  private isCreateDialogVisible = false;

  private readonly [searchOrgContextKey] = new SearchOrgContextController(this);

  connectedCallback() {
    if (
      !this.orgTab ||
      !Object.values(OrgTab).includes(this.orgTab as OrgTab)
    ) {
      this.navigate.to(`${this.navigate.orgBasePath}/${OrgTab.Dashboard}`);
    }
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
      this.orgSlugState
    ) {
      if (this.userOrg) {
        void this.updateOrg();
        void this.updateOrgProxies();
      } else {
        // Couldn't find org with slug, redirect to first org
        const org = this.userInfo.orgs[0] as UserOrg | undefined;
        if (org) {
          this.navigate.to(
            `/${RouteNamespace.PrivateOrgs}/${org.slug}/${OrgTab.Dashboard}`,
          );
        } else {
          this.navigate.to(`/account/settings`);
        }

        return;
      }
    } else if (changedProperties.has("orgTab") && this.orgId) {
      // Get most up to date org data
      void this.updateOrg();
      void this[searchOrgContextKey].refresh();
    }
    if (changedProperties.has("openDialogName")) {
      // Sync URL to create dialog
      const url = new URL(window.location.href);
      if (this.openDialogName) {
        if (url.searchParams.get("new") !== this.openDialogName) {
          url.searchParams.set("new", this.openDialogName);
          this.navigate.to(`${url.pathname}${url.search}`);
        }
      } else {
        const prevOpenDialogName = changedProperties.get("openDialogName");
        if (
          prevOpenDialogName &&
          prevOpenDialogName === url.searchParams.get("new")
        ) {
          url.searchParams.delete("new");
          this.navigate.to(`${url.pathname}${url.search}`);
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
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve organization at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "org-retrieve-error",
      });
    }
  }

  private async updateOrgProxies() {
    try {
      this.proxies = await this.getOrgProxies(this.orgId);
    } catch (e) {
      console.debug(e);
    }
  }

  async firstUpdated() {
    // if slug is actually an orgId (UUID), attempt to lookup the slug
    // and redirect to the slug url
    if (this.orgSlugState && UUID_REGEX.test(this.orgSlugState)) {
      const org = await this.getOrg(this.orgSlugState);
      const actualSlug = org?.slug;
      if (actualSlug) {
        this.navigate.to(
          window.location.href
            .slice(window.location.origin.length)
            .replace(this.orgSlugState, actualSlug),
        );
        return;
      }
    }
    // Sync URL to create dialog
    const dialogName = this.getDialogName();
    if (dialogName) this.openDialog(dialogName);

    void this.updateOrgProxies();
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
            : "w-full max-w-screen-desktop"} mx-auto box-border flex flex-1 flex-col p-3 lg:px-10 lg:pb-10"
          aria-labelledby="${this.orgTab}-tab"
        >
          ${when(this.userOrg, (userOrg) =>
            choose(
              this.orgTab,
              [
                [OrgTab.Dashboard, this.renderDashboard],
                [
                  OrgTab.Items,
                  () => html`
                    <btrix-document-title
                      title=${`${msg("Archived Items")} – ${userOrg.name}`}
                    ></btrix-document-title>
                    ${this.renderArchivedItem()}
                  `,
                ],
                [
                  OrgTab.Workflows,
                  () => html`
                    <btrix-document-title
                      title=${`${msg("Crawl Workflows")} – ${userOrg.name}`}
                    ></btrix-document-title>
                    ${this.renderWorkflows()}
                  `,
                ],
                [
                  OrgTab.BrowserProfiles,
                  () => html`
                    <btrix-document-title
                      title=${`${msg("Browser Profiles")} – ${userOrg.name}`}
                    ></btrix-document-title>
                    ${this.renderBrowserProfiles()}
                  `,
                ],
                [
                  OrgTab.Collections,
                  () => html`
                    <btrix-document-title
                      title=${`${msg("Collections")} – ${userOrg.name}`}
                    ></btrix-document-title>
                    ${this.renderCollections()}
                  `,
                ],
                [
                  OrgTab.Settings,
                  () =>
                    this.appState.isAdmin
                      ? html`
                          <btrix-document-title
                            title=${`${msg("Org Settings")} – ${userOrg.name}`}
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
        <btrix-overflow-scroll class="-mx-3 part-[content]:px-3">
          <nav class="flex w-max items-end xl:px-6">
            ${this.renderNavTab({
              tabName: OrgTab.Dashboard,
              label: msg("Dashboard"),
            })}
            ${this.renderNavTab({
              tabName: OrgTab.Workflows,
              label: msg("Crawling"),
            })}
            ${this.renderNavTab({
              tabName: OrgTab.Items,
              label: msg("Archived Items"),
            })}
            ${this.renderNavTab({
              tabName: OrgTab.Collections,
              label: msg("Collections"),
            })}
            ${when(this.appState.isCrawler, () =>
              this.renderNavTab({
                tabName: OrgTab.BrowserProfiles,
                label: msg("Browser Profiles"),
              }),
            )}
            ${when(this.appState.isAdmin || this.userInfo?.isSuperAdmin, () =>
              this.renderNavTab({
                tabName: OrgTab.Settings,
                label: msg("Settings"),
              }),
            )}
          </nav>
        </btrix-overflow-scroll>
      </div>

      <hr />
    `;
  }

  private renderNavTab({ tabName, label }: { tabName: OrgTab; label: string }) {
    const isActive = this.orgTab === tabName;

    return html`
      <a
        id="${tabName}-tab"
        class="block flex-shrink-0 rounded-t px-3 transition-colors hover:bg-neutral-50"
        href=${`${this.navigate.orgBasePath}/${tabName}`}
        aria-selected=${isActive}
        @click=${this.navigate.link}
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
            if (this.orgTab === OrgTab.Dashboard) {
              this.navigate.to(`${this.navigate.orgBasePath}/items/upload`);
            }
          }}
        ></btrix-file-uploader>

        ${when(this.org, (org) =>
          when(
            this.proxies,
            (proxies) => html`
              <btrix-new-browser-profile-dialog
                .proxyServers=${proxies.servers}
                defaultProxyId=${ifDefined(
                  org.crawlingDefaults?.proxyId ||
                    proxies.default_proxy_id ||
                    undefined,
                )}
                defaultCrawlerChannel=${ifDefined(
                  org.crawlingDefaults?.crawlerChannel || undefined,
                )}
                ?open=${this.openDialogName === "browser-profile"}
                @sl-hide=${() => (this.openDialogName = undefined)}
              >
              </btrix-new-browser-profile-dialog>
            `,
          ),
        )}

        <btrix-collection-create-dialog
          ?open=${this.openDialogName === "collection"}
          @sl-hide=${() => (this.openDialogName = undefined)}
          @btrix-collection-saved=${(e: CollectionSavedEvent) => {
            this.navigate.to(
              `${this.navigate.orgBasePath}/collections/view/${e.detail.id}/items`,
            );
          }}
        >
        </btrix-collection-create-dialog>
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
        .qaTab=${params.qaTab}
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
          workflowTab=${ifDefined(
            params.itemId ? WorkflowTab.Crawls : params.workflowTab,
          )}
          openDialogName=${this.viewStateData?.dialog}
          ?isEditing=${isEditing}
          ?isCrawler=${this.appState.isCrawler}
          .maxBrowserWindows=${this.maxBrowserWindows}
        ></btrix-workflow-detail>
      `;
    }

    if (this.orgPath.startsWith("/workflows/new")) {
      const { workflow, seeds, seedFile, scopeType } = (this.viewStateData ||
        {}) satisfies Partial<DuplicateWorkflowSettings>;

      return html` <btrix-workflows-new
        class="col-span-5"
        ?isCrawler=${this.appState.isCrawler}
        .initialWorkflow=${workflow}
        .initialSeeds=${seeds}
        .initialSeedFile=${seedFile}
        scopeType=${ifDefined(scopeType)}
        @select-new-dialog=${this.onSelectNewDialog}
      ></btrix-workflows-new>`;
    }

    return html`<btrix-workflows-list
      @select-new-dialog=${this.onSelectNewDialog}
      @select-job-type=${(e: SelectJobTypeEvent) => {
        this.openDialogName = undefined;

        if (e.detail !== this.appState.userPreferences?.newWorkflowScopeType) {
          AppStateService.partialUpdateUserPreferences({
            newWorkflowScopeType: e.detail,
          });
        }

        this.navigate.to(`${this.navigate.orgBasePath}/workflows/new`, {
          scopeType: e.detail,
        });
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
          proxyId: params.proxyId ?? null,
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
        class="flex min-h-screen flex-1 flex-col pb-7"
        collectionId=${params.collectionId}
        collectionTab=${ifDefined(
          params.collectionTab as CollectionTab | undefined,
        )}
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
      @btrix-update-org=${(e: CustomEvent<UpdateOrgDetail>) => {
        e.stopPropagation();

        // Optimistic update
        AppStateService.partialUpdateOrg({
          id: this.orgId,
          ...e.detail,
        });

        void this.updateOrg();
      }}
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
    const data = await this.api.fetch<OrgData>(`/orgs/${orgId}`);

    return data;
  }

  private async getOrgProxies(orgId: string): Promise<ProxiesAPIResponse> {
    return this.api.fetch<ProxiesAPIResponse>(
      `/orgs/${orgId}/crawlconfigs/crawler-proxies`,
    );
  }

  private async onOrgRemoveMember(e: OrgRemoveMemberEvent) {
    void this.removeMember(e.detail.member);
  }

  private async onStorageQuotaUpdate(e: CustomEvent<QuotaUpdateDetail>) {
    e.stopPropagation();

    if (!this.org) return;

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

    if (!this.org) return;

    const { reached } = e.detail;

    AppStateService.partialUpdateOrg({
      id: this.orgId,
      execMinutesQuotaReached: reached,
    });
  }

  private async onUserRoleChange(e: UserRoleChangeEvent) {
    const { user, newRole } = e.detail;

    try {
      await this.api.fetch(`/orgs/${this.orgId}/user-role`, {
        method: "PATCH",
        body: JSON.stringify({
          email: user.email,
          role: newRole,
        }),
      });

      this.notify.toast({
        message: msg(
          str`Successfully updated role for ${user.name || user.email}.`,
        ),
        variant: "success",
        icon: "check2-circle",
        id: "user-updated-status",
      });

      const org = await this.getOrg(this.orgId);

      if (org) {
        AppStateService.partialUpdateOrg({
          id: org.id,
          users: org.users,
        });
      }
    } catch (e) {
      console.debug(e);

      this.notify.toast({
        message: isApiError(e)
          ? e.message
          : msg(
              str`Sorry, couldn't update role for ${
                user.name || user.email
              } at this time.`,
            ),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "user-updated-status",
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
      await this.api.fetch(`/orgs/${this.orgId}/remove`, {
        method: "POST",
        body: JSON.stringify({
          email: member.email,
        }),
      });

      this.notify.toast({
        message: msg(
          str`Successfully removed ${member.name || member.email} from ${
            this.userOrg.name
          }.`,
        ),
        variant: "success",
        icon: "check2-circle",
        id: "user-updated-status",
      });
      if (isSelf) {
        // FIXME better UX, this is the only page currently that doesn't require org...
        this.navigate.to("/account/settings");
      } else {
        const org = await this.getOrg(this.orgId);

        if (org) {
          AppStateService.partialUpdateOrg({
            id: org.id,
            users: org.users,
          });
        }
      }
    } catch (e) {
      console.debug(e);

      this.notify.toast({
        message: isApiError(e)
          ? e.message
          : msg(
              str`Sorry, couldn't remove ${
                member.name || member.email
              } at this time.`,
            ),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "user-updated-status",
      });
    }
  }
}
