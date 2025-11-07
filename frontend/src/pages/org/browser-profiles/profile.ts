import { consume } from "@lit/context";
import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlMenuItem } from "@shoelace-style/shoelace";
import { html, nothing, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type {
  BtrixFilterChipChangeEvent,
  FilterChip,
} from "@/components/ui/filter-chip";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import {
  orgCrawlerChannelsContext,
  type OrgCrawlerChannelsContext,
} from "@/context/org-crawler-channels";
import {
  orgProxiesContext,
  type OrgProxiesContext,
} from "@/context/org-proxies";
import { ClipboardController } from "@/controllers/clipboard";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import type {
  BrowserConnectionChange,
  ProfileBrowser,
} from "@/features/browser-profiles/profile-browser";
import {
  badges,
  badgesSkeleton,
} from "@/features/browser-profiles/templates/badges";
import type { WorkflowColumnName } from "@/features/crawl-workflows/workflow-list";
import { emptyMessage } from "@/layouts/emptyMessage";
import { labelWithIcon } from "@/layouts/labelWithIcon";
import { page } from "@/layouts/page";
import { panel, panelBody } from "@/layouts/panel";
import { OrgTab } from "@/routes";
import { stringFor } from "@/strings/ui";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { Profile, Workflow } from "@/types/crawler";
import type { CrawlState } from "@/types/crawlState";
import { SortDirection } from "@/types/utils";
import { isApiError } from "@/utils/api";
import { isNotEqual } from "@/utils/is-not-equal";
import { isArchivingDisabled } from "@/utils/orgs";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

const INITIAL_PAGE_SIZE = 5;
const WORKFLOW_PAGE_QUERY = "workflowsPage";

const workflowColumns = [
  "name",
  "latest-crawl",
  "actions",
] as const satisfies WorkflowColumnName[];

@customElement("btrix-browser-profiles-profile-page")
@localized()
export class BrowserProfilesProfilePage extends BtrixElement {
  @consume({ context: orgProxiesContext, subscribe: true })
  private readonly orgProxies?: OrgProxiesContext;

  @consume({ context: orgCrawlerChannelsContext, subscribe: true })
  private readonly orgCrawlerChannels?: OrgCrawlerChannelsContext;

  @property({ type: String })
  profileId = "";

  @state({ hasChanged: isNotEqual })
  private workflowParams: Required<APIPaginationQuery> & {
    lastCrawlState?: CrawlState[];
  } = {
    page: parsePage(
      new URLSearchParams(location.search).get(WORKFLOW_PAGE_QUERY),
    ),
    pageSize: INITIAL_PAGE_SIZE,
  };

  @state()
  private openDialog?:
    | "metadata"
    | "metadata-name"
    | "metadata-description"
    | "config"
    | "browser";

  @state()
  private initialNavigateUrl?: string;

  @state()
  private isBrowserLoaded = false;

  @query("btrix-profile-browser")
  private readonly profileBrowser?: ProfileBrowser | null;

  private get profile() {
    return this.profileTask.value;
  }

  private readonly profileTask = new Task(this, {
    task: async ([profileId], { signal }) => {
      const profile = await this.getProfile(profileId, signal);

      return profile;
    },
    args: () => [this.profileId] as const,
  });

  private readonly browserIdTask = new Task(this, {
    autoRun: false,
    task: async ([profileId, url], { signal }) => {
      if (!url) return;

      const { browserid } = await this.createBrowser(
        { profileId, url },
        signal,
      );

      return browserid;
    },
    args: () => [this.profileId, this.initialNavigateUrl] as const,
  });

  private readonly workflowsTask = new Task(this, {
    task: async ([profileId, workflowParams], { signal }) => {
      return this.getWorkflows({ ...workflowParams, profileId }, signal);
    },
    args: () => [this.profileId, this.workflowParams] as const,
  });

  render() {
    const header = {
      breadcrumbs: [
        {
          href: `${this.navigate.orgBasePath}/${OrgTab.BrowserProfiles}`,
          content: msg("Browser Profiles"),
        },
        {
          content: this.profile?.name,
        },
      ],
      title: html`${this.profile?.name ??
      html`<sl-skeleton
        class="inline-block h-6 w-36"
        effect="sheen"
      ></sl-skeleton>`}
      ${when(
        this.profile && this.appState.isCrawler,
        () =>
          html`<sl-tooltip content=${msg("Edit Name")} placement="right">
            <sl-icon-button
              class="ml-1 text-base"
              name="pencil"
              @click=${() => (this.openDialog = "metadata-name")}
            ></sl-icon-button>
          </sl-tooltip>`,
      )} `,
      secondary: when(this.profile, badges, badgesSkeleton),
      actions: this.renderActions(),
    } satisfies Parameters<typeof page>[0];

    const org = this.org;
    const proxies = this.orgProxies;
    const crawlerChannels = this.orgCrawlerChannels;
    const crawlingDefaultsReady = org && proxies && crawlerChannels;

    return html`${page(header, this.renderPage)}
    ${when(
      this.profile,
      (profile) =>
        html`<btrix-profile-metadata-dialog
            .profile=${profile}
            ?open=${this.openDialog?.startsWith("metadata")}
            autofocusOn=${ifDefined(
              this.openDialog === "metadata-name"
                ? "name"
                : this.openDialog === "metadata-description"
                  ? "description"
                  : undefined,
            )}
            @sl-after-hide=${() => (this.openDialog = undefined)}
            @btrix-updated=${() => {
              void this.profileTask.run();
              this.openDialog = undefined;
            }}
          >
          </btrix-profile-metadata-dialog>

          ${crawlingDefaultsReady
            ? html`<btrix-profile-settings-dialog
                .profile=${profile}
                .proxyServers=${proxies.servers}
                .crawlerChannels=${crawlerChannels}
                defaultUrl=${profile.origins[0]}
                defaultCrawlerChannel=${ifDefined(profile.crawlerChannel)}
                defaultProxyId=${ifDefined(
                  profile.proxyId || proxies.default_proxy_id || undefined,
                )}
                ?open=${this.openDialog === "config"}
                @sl-after-hide=${() => (this.openDialog = undefined)}
              ></btrix-profile-settings-dialog>`
            : nothing} `,
    )} `;
  }

  private renderActions() {
    const archivingDisabled = isArchivingDisabled(this.org);
    const menuItemClick = (cb: () => void) => (e: MouseEvent) => {
      if (e.defaultPrevented || (e.currentTarget as SlMenuItem).disabled)
        return;
      cb();
    };

    return html`
      <sl-button size="small" @click=${() => this.openBrowser()}>
        <sl-icon name="window-fullscreen" slot="prefix"></sl-icon>
        ${msg("View Profile")}
      </sl-button>
      <sl-dropdown distance="4" placement="bottom-end">
        <sl-button size="small" slot="trigger" caret>
          ${msg("Actions")}
        </sl-button>
        <sl-menu>
          ${when(
            this.appState.isCrawler,
            () => html`
              <sl-menu-item
                ?disabled=${archivingDisabled}
                @click=${menuItemClick(() => (this.openDialog = "config"))}
              >
                <sl-icon slot="prefix" name="gear"></sl-icon>
                ${msg("Configure Profile")}
              </sl-menu-item>
              <sl-menu-item @click=${() => (this.openDialog = "metadata")}>
                <sl-icon slot="prefix" name="pencil"></sl-icon>
                ${msg("Edit Metadata")}
              </sl-menu-item>
              <sl-menu-item
                ?disabled=${archivingDisabled || !this.profile}
                @click=${menuItemClick(() => void this.duplicateProfile())}
              >
                <sl-icon slot="prefix" name="files"></sl-icon>
                ${msg("Duplicate Profile")}
              </sl-menu-item>
              <sl-divider></sl-divider>
            `,
          )}
          <sl-menu-item
            @click=${() => ClipboardController.copyToClipboard(this.profileId)}
          >
            <sl-icon name="copy" slot="prefix"></sl-icon>
            ${msg("Copy Profile ID")}
          </sl-menu-item>
          ${when(this.appState.isCrawler, () => {
            const disabled = this.profile?.inUse;
            return html`
              <sl-divider></sl-divider>
              <sl-menu-item
                class="menu-item-danger"
                ?disabled=${disabled}
                title=${ifDefined(
                  disabled ? msg("Cannot delete profile in use") : undefined,
                )}
                @click=${menuItemClick(() => void this.deleteProfile())}
              >
                <sl-icon slot="prefix" name="trash3"></sl-icon>
                ${msg("Delete Profile")}
              </sl-menu-item>
            `;
          })}
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private readonly renderPage = () => {
    return html`
      <div class="mt-1 grid grid-cols-7 gap-7">
        <div class="col-span-full flex flex-col gap-7 lg:col-span-5">
          ${this.renderProfile()} ${this.renderUsage()}
        </div>

        <div class="sticky top-3 col-span-full self-start lg:col-span-2">
          ${this.renderOverview()}
        </div>
      </div>
    `;
  };

  private renderProfile() {
    const readyBrowserId =
      this.openDialog === "browser" &&
      this.profile &&
      this.initialNavigateUrl &&
      this.browserIdTask.value;

    return panel({
      heading: msg("Visited Sites"),
      actions: this.appState.isCrawler
        ? html`<sl-tooltip content=${msg("Configure Profile")}>
            <sl-icon-button
              class="text-base"
              name="gear"
              @click=${() => (this.openDialog = "config")}
            ></sl-icon-button>
          </sl-tooltip>`
        : undefined,
      body: html`${this.renderOrigins()}

        <btrix-dialog
          class="[--body-spacing:0] [--width:auto]"
          .label=${this.profile?.name || ""}
          ?open=${this.openDialog === "browser"}
          @sl-after-hide=${() => this.closeBrowser()}
        >
          <sl-icon-button
            slot="header-actions"
            name="layout-sidebar-reverse"
            @click=${() => this.profileBrowser?.toggleOrigins()}
          ></sl-icon-button>
          ${readyBrowserId
            ? html`<btrix-profile-browser
                class="part-[base]:aspect-4/3 part-[base]:h-[calc(100vh-10rem)] part-[base]:w-auto"
                browserId=${readyBrowserId}
                initialNavigateUrl=${ifDefined(this.initialNavigateUrl)}
                @btrix-browser-load=${this.onBrowserLoad}
                @btrix-browser-reload=${this.onBrowserReload}
                @btrix-browser-error=${this.onBrowserError}
                @btrix-browser-connection-change=${this
                  .onBrowserConnectionChange}
                readOnly
                hideControls
              ></btrix-profile-browser> `
            : html`<div class="aspect-4/3 h-[calc(100vh-10rem)] w-auto"></div>`}
          <div slot="footer" class="text-left text-neutral-500">
            <btrix-badge variant="blue"> ${msg("View Only")} </btrix-badge>
            ${msg("Browsing history will not be saved to profile.")}
          </div>
        </btrix-dialog> `,
    });
  }

  private renderOrigins() {
    const originsSkeleton = () => html`<div class="h-9 rounded border"></div>`;

    const origins = (profile: Profile) =>
      profile.origins.map(
        (origin) => html`
          <li class="flex items-center gap-2">
            <div
              class="flex flex-1 items-center gap-2 overflow-hidden border-r"
            >
              <div class="border-r p-1">
                <btrix-copy-button .value=${origin} placement="left">
                </btrix-copy-button>
              </div>
              <btrix-code
                class="block flex-1 truncate"
                language="url"
                value=${origin}
                nowrap
              ></btrix-code>
            </div>

            <div class="flex items-center gap-1">
              <sl-tooltip placement="left" content=${msg("View in Profile")}>
                <sl-icon-button
                  name="window-fullscreen"
                  @click=${() => {
                    this.initialNavigateUrl = origin;
                    this.openBrowser();
                  }}
                ></sl-icon-button>
              </sl-tooltip>
              <sl-tooltip placement="right" content=${msg("Open in New Tab")}>
                <sl-icon-button
                  name="arrow-up-right"
                  href=${origin}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                ></sl-icon-button>
              </sl-tooltip>
            </div>
          </li>
        `,
      );

    return when(
      this.profile,
      (profile) => html`
        <ul class="divide-y rounded-lg border bg-white shadow-sm">
          ${origins(profile)}
        </ul>
      `,
      originsSkeleton,
    );
  }

  private renderOverview() {
    const none = html`<span class="text-neutral-400">${stringFor.none}</span>`;

    return panel({
      heading: msg("Overview"),
      actions: this.appState.isCrawler
        ? html`<sl-tooltip content=${msg("Edit Metadata")}>
            <sl-icon-button
              class="text-base"
              name="pencil"
              @click=${() => (this.openDialog = "metadata-description")}
            ></sl-icon-button>
          </sl-tooltip>`
        : undefined,
      body: html`
        <btrix-desc-list>
          <btrix-desc-list-item label=${msg("Description")}>
            ${this.renderDetail((profile) =>
              profile.description
                ? html`
                    <!-- display: inline -->
                    <div
                      class="text-balanced whitespace-pre-line font-sans leading-relaxed text-neutral-600"
                      >${profile.description}</div
                    >
                  `
                : none,
            )}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Tags")}>
            ${this.renderDetail(() => html`${none}`)}
          </btrix-desc-list-item>
        </btrix-desc-list>
        <sl-divider class="my-5"></sl-divider>
        <btrix-desc-list>
          <btrix-desc-list-item label=${msg("Size")}>
            ${this.renderDetail((profile) =>
              this.localize.bytes(profile.resource?.size || 0),
            )}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Visited Sites")}>
            ${this.renderDetail(
              (profile) =>
                `${this.localize.number(profile.origins.length)} ${pluralOf("origins", profile.origins.length)}`,
            )}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Last Modified")}>
            ${this.renderDetail((profile) =>
              this.localize.relativeDate(
                // NOTE older profiles may not have "modified" data
                profile.modified || profile.created,
              ),
            )}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Modification Reason")}>
            ${this.renderDetail((profile) => {
              const userName = profile.modifiedByName || profile.createdByName;
              if (userName) {
                return `${msg("Updated by")} ${userName}`;
              }

              return stringFor.notApplicable;
            })}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Backup Status")}>
            ${this.renderDetail((profile) => {
              const isBackedUp =
                profile.resource?.replicas &&
                profile.resource.replicas.length > 0;
              return labelWithIcon({
                label: isBackedUp ? msg("Backed Up") : msg("Not Backed Up"),
                icon: html`<sl-icon
                  name=${isBackedUp ? "clouds-fill" : "cloud-slash-fill"}
                ></sl-icon>`,
              });
            })}
          </btrix-desc-list-item>
        </btrix-desc-list>
      `,
    });
  }

  private renderUsage() {
    const workflowListSkeleton = () =>
      html`<sl-skeleton class="h-36" effect="sheen"></sl-skeleton>`;

    return panel({
      heading: msg("Usage"),
      body: when(
        this.profile,
        (profile) =>
          profile.inUse
            ? html`
                <div class="mb-4 rounded-lg border px-4 py-2">
                  <btrix-desc-list horizontal>
                    <btrix-desc-list-item label=${msg("In Use By")}>
                      ${this.workflowsTask.value
                        ? `${this.localize.number(this.workflowsTask.value.total)} ${pluralOf("workflows", this.workflowsTask.value.total)}`
                        : html`<sl-skeleton></sl-skeleton>`}
                    </btrix-desc-list-item>
                    <btrix-desc-list-item label=${msg("Modified By Use")}>
                      ${msg("No")}
                    </btrix-desc-list-item>
                  </btrix-desc-list>
                </div>

                ${this.workflowsTask.render({
                  initial: workflowListSkeleton,
                  pending: () =>
                    this.workflowsTask.value
                      ? this.renderWorkflows(this.workflowsTask.value)
                      : workflowListSkeleton(),
                  complete: this.renderWorkflows,
                })}
              `
            : panelBody({
                content: emptyMessage({
                  message: msg(
                    "This profile is not in use by any crawl workflows.",
                  ),
                  actions: html`<sl-button size="small">
                    <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                    ${msg("Create Workflow Using Profile")}</sl-button
                  >`,
                }),
              }),
        workflowListSkeleton,
      ),
    });
  }

  private readonly renderWorkflows = (
    workflows: APIPaginatedList<Workflow>,
  ) => {
    const failedNotLoggedInState = "failed_not_logged_in" satisfies CrawlState;

    return html`
      <div class="mb-3 rounded-lg border bg-neutral-50 px-6 py-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="whitespace-nowrap text-sm text-neutral-500">
            ${msg("Filter by:")}
          </span>

          <btrix-filter-chip
            ?checked=${this.workflowParams.lastCrawlState?.includes(
              failedNotLoggedInState,
            )}
            @btrix-change=${(e: BtrixFilterChipChangeEvent) => {
              const { checked } = e.target as FilterChip;

              this.workflowParams = {
                ...this.workflowParams,
                lastCrawlState: checked ? [failedNotLoggedInState] : undefined,
              };
            }}
          >
            ${CrawlStatus.getContent({ state: failedNotLoggedInState }).label}
          </btrix-filter-chip>
        </div>
      </div>

      ${workflows.total
        ? html`
            <btrix-workflow-list
              .columns=${workflowColumns}
              aria-describedby="workflow-list-desc"
            >
              ${workflows.items.map(
                (workflow) =>
                  html`<btrix-workflow-list-item .workflow=${workflow}>
                    <sl-menu slot="menu">
                      ${when(
                        this.appState.isCrawler,
                        () => html`
                          <btrix-menu-item-link
                            href="${this.navigate
                              .orgBasePath}/${OrgTab.Workflows}/${workflow.id}?edit"
                          >
                            <sl-icon name="gear" slot="prefix"></sl-icon>
                            ${msg("Edit Workflow Settings")}
                          </btrix-menu-item-link>
                          <sl-divider></sl-divider>
                        `,
                      )}
                      <btrix-menu-item-link
                        href="${this.navigate
                          .orgBasePath}/${OrgTab.Workflows}/${workflow.id}"
                      >
                        <sl-icon
                          name="arrow-return-right"
                          slot="prefix"
                        ></sl-icon>
                        ${msg("Go to Workflow")}
                      </btrix-menu-item-link>
                    </sl-menu>
                  </btrix-workflow-list-item>`,
              )}
            </btrix-workflow-list>

            <footer class="mt-4 flex justify-center">
              <btrix-pagination
                name=${WORKFLOW_PAGE_QUERY}
                page=${workflows.page}
                size=${workflows.pageSize}
                totalCount=${workflows.total}
                @page-change=${(e: PageChangeEvent) => {
                  this.workflowParams = {
                    ...this.workflowParams,
                    page: e.detail.page,
                  };
                }}
              >
              </btrix-pagination>
            </footer>
          `
        : emptyMessage({
            classNames: tw`border-y`,
            message: msg("No matching workflows found."),
            actions: html`
              <sl-button
                size="small"
                @click=${() =>
                  (this.workflowParams = {
                    ...this.workflowParams,
                    lastCrawlState: undefined,
                  })}
              >
                <sl-icon slot="prefix" name="x-lg"></sl-icon>
                ${msg("Clear filters")}</sl-button
              >
            `,
          })}
    `;
  };

  private readonly renderDetail = (
    render: (profile: Profile) => string | TemplateResult,
  ) =>
    when(
      this.profile,
      render,
      () => html`<sl-skeleton effect="sheen"></sl-skeleton>`,
    );

  private readonly openBrowser = () => {
    if (!this.profile) return;

    this.initialNavigateUrl =
      this.initialNavigateUrl || this.profile.origins[0];

    void this.browserIdTask.run();

    this.openDialog = "browser";
  };

  private readonly closeBrowser = () => {
    this.initialNavigateUrl = undefined;
    this.openDialog = undefined;
  };

  private readonly onBrowserLoad = () => {
    this.isBrowserLoaded = true;
  };

  private readonly onBrowserReload = () => {
    this.isBrowserLoaded = false;
    void this.browserIdTask.run();
  };

  private readonly onBrowserError = () => {
    this.isBrowserLoaded = false;
  };

  private readonly onBrowserConnectionChange = (
    e: CustomEvent<BrowserConnectionChange>,
  ) => {
    this.isBrowserLoaded = e.detail.connected;
  };

  private async getProfile(profileId: string, signal: AbortSignal) {
    return await this.api.fetch<Profile>(
      `/orgs/${this.orgId}/profiles/${profileId}`,
      { signal },
    );
  }

  private async duplicateProfile() {
    if (!this.profile) {
      console.debug("missing profile");
      return;
    }

    const profile = this.profile;
    const url = profile.origins[0];

    try {
      const data = await this.createBrowser({
        url,
      });

      this.notify.toast({
        message: msg("Starting up browser..."),
        variant: "success",
        icon: "check2-circle",
        id: "browser-profile-status",
      });

      this.navigate.to(
        `${this.navigate.orgBasePath}/browser-profiles/profile/browser/${
          data.browserid
        }?${queryString.stringify({
          url,
          name: `${profile.name} ${msg("Copy")}`,
          crawlerChannel: profile.crawlerChannel,
          proxyId: profile.proxyId,
        })}`,
      );
    } catch (e) {
      console.debug(e);

      this.notify.toast({
        message: msg("Sorry, something went wrong starting up browser."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "browser-profile-status",
      });
    }
  }

  private async deleteProfile() {
    const name_of_browser_profile = this.profile?.name
      ? html`<strong class="font-semibold">${this.profile.name}</strong>`
      : undefined;

    try {
      await this.api.fetch<Profile>(
        `/orgs/${this.orgId}/profiles/${this.profileId}`,
        {
          method: "DELETE",
        },
      );

      this.notify.toast({
        message: name_of_browser_profile
          ? msg(html`Deleted ${name_of_browser_profile}.`)
          : msg("Browser profile deleted."),
        variant: "success",
        icon: "check2-circle",
        id: "browser-profile-status",
      });

      this.navigate.to(
        `${this.navigate.orgBasePath}/${OrgTab.BrowserProfiles}`,
      );
    } catch (e) {
      let title: string | undefined;
      let message: string | TemplateResult = msg(
        "Sorry, couldn't delete browser profile at this time.",
      );

      if (isApiError(e)) {
        if (e.message === "profile_in_use") {
          title = msg("Cannot delete browser profile in use");
          message = name_of_browser_profile
            ? msg(
                html`Please remove ${name_of_browser_profile} from all crawl
                workflows to continue.`,
              )
            : msg(
                "Please remove this browser profile from all crawl workflows to continue.",
              );
        }
      }

      this.notify.toast({
        title,
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
        duration: 10000,
        id: "browser-profile-status",
      });
    }
  }

  private async createBrowser(
    params: { url: string; profileId?: string },
    signal?: AbortSignal,
  ) {
    return this.api.fetch<{ browserid: string }>(
      `/orgs/${this.orgId}/profiles/browser`,
      {
        method: "POST",
        body: JSON.stringify(params),
        signal,
      },
    );
  }

  private async getWorkflows(
    params: { profileId: string } & APIPaginationQuery,
    signal: AbortSignal,
  ) {
    const query = queryString.stringify({
      ...params,
      profileIds: [params.profileId],
      sortBy: "lastRun",
      sortDirection: SortDirection.Descending,
    });

    const data = await this.api.fetch<APIPaginatedList<Workflow>>(
      `/orgs/${this.orgId}/crawlconfigs?${query}`,
      { signal },
    );

    return data;
  }
}
