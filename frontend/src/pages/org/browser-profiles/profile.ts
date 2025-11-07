import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
// import clsx from "clsx";
import { html, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import capitalize from "lodash/fp/capitalize";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type {
  BtrixFilterChipChangeEvent,
  FilterChip,
} from "@/components/ui/filter-chip";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import type { TabGroup } from "@/components/ui/tab-group/tab-group";
import { ClipboardController } from "@/controllers/clipboard";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import type { BrowserConnectionChange } from "@/features/browser-profiles/profile-browser";
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
import { isNotEqual } from "@/utils/is-not-equal";
import { isArchivingDisabled } from "@/utils/orgs";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";

const INITIAL_PAGE_SIZE = 5;
const WORKFLOW_PAGE_QUERY = "workflowsPage";

enum ProfileTab {
  Config = "config",
  Browser = "browser",
}

const workflowColumns = [
  "name",
  "latest-crawl",
  "actions",
] as const satisfies WorkflowColumnName[];

@customElement("btrix-browser-profiles-profile-page")
@localized()
export class BrowserProfilesProfilePage extends BtrixElement {
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
    | "config";

  @state()
  private configuringProfile = false;

  @state()
  private activetab = ProfileTab.Config;

  @state()
  private initialNavigateUrl?: string;

  @state()
  private isBrowserLoaded = false;

  @query("btrix-tab-group")
  private readonly tabGroup?: TabGroup | null;

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
    const badges = (profile: Profile) => {
      return html`<div class="flex flex-wrap gap-3 whitespace-nowrap ">
        <btrix-badge
          variant=${profile.inUse ? "cyan" : "neutral"}
          class="font-monostyle"
        >
          <sl-icon
            name=${profile.inUse ? "check-circle" : "dash-circle"}
            class="mr-1.5"
          ></sl-icon>
          ${profile.inUse ? msg("In Use") : msg("Not In Use")}
        </btrix-badge>

        ${when(
          profile.crawlerChannel,
          (channel) =>
            html`<btrix-badge class="font-monostyle">
              ${capitalize(channel)} ${msg("Channel")}</btrix-badge
            >`,
        )}
        ${when(
          profile.proxyId,
          (proxy) =>
            html`<btrix-badge class="font-monostyle">
              ${proxy} ${msg("Proxy")}</btrix-badge
            >`,
        )}
      </div> `;
    };
    const badgesSkeleton = () =>
      html`<sl-skeleton class="h-4 w-12"></sl-skeleton>`;

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
      // prefix: when(
      //   this.profile,
      //   (profile) =>
      //     html`<sl-tooltip
      //       content=${profile.inUse ? msg("In Use") : msg("Not in Use")}
      //     >
      //       <sl-icon
      //         name=${profile.inUse ? "check-circle" : "dash-circle"}
      //         class=${clsx(
      //           tw`text-lg`,
      //           profile.inUse ? tw`text-primary` : "text-neutral-500",
      //         )}
      //       ></sl-icon>
      //     </sl-tooltip>`,
      //   () =>
      //     html`<sl-skeleton
      //       class="size-5 [--border-radius:100%]"
      //     ></sl-skeleton>`,
      // ),
      secondary: when(this.profile, badges, badgesSkeleton),
      actions: this.renderActions(),
    } satisfies Parameters<typeof page>[0];

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

          <btrix-profile-settings-dialog
            .profile=${profile}
            defaultUrl=${profile.origins[0]}
            defaultCrawlerChannel=${ifDefined(profile.crawlerChannel)}
            defaultProxyId=${ifDefined(profile.proxyId)}
            ?open=${this.openDialog === "config"}
            @sl-after-hide=${() => (this.openDialog = undefined)}
            @btrix-submit=${async () => {
              this.openDialog = undefined;
              this.activetab = ProfileTab.Browser;
              this.openBrowser();

              await this.updateComplete;

              this.configuringProfile = true;
            }}
          ></btrix-profile-settings-dialog> `,
    )} `;
  }

  private renderActions() {
    const archivingDisabled = isArchivingDisabled(this.org);

    return html`
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
                @click=${() => (this.openDialog = "config")}
              >
                <sl-icon slot="prefix" name="gear"></sl-icon>
                ${msg("Configure Profile")}
              </sl-menu-item>
              <sl-menu-item @click=${() => (this.openDialog = "metadata")}>
                <sl-icon slot="prefix" name="pencil"></sl-icon>
                ${msg("Edit Metadata")}
              </sl-menu-item>
              <sl-menu-item ?disabled=${archivingDisabled} @click=${() => {}}>
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
          ${when(
            this.appState.isCrawler,
            () => html`
              <sl-divider></sl-divider>
              <sl-menu-item class="menu-item-danger" @click=${() => {}}>
                <sl-icon slot="prefix" name="trash3"></sl-icon>
                ${msg("Delete Profile")}
              </sl-menu-item>
            `,
          )}
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private readonly renderPage = () => {
    return html`
      <div class="grid grid-cols-7 gap-7">
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
    const showBrowser =
      this.activetab === ProfileTab.Browser &&
      this.profileTask.value &&
      this.browserIdTask.value &&
      this.initialNavigateUrl;
    return html`
      <btrix-tab-group
        class="scroll-mt-3"
        active=${this.activetab}
        @btrix-tab-change=${(e: CustomEvent<string>) => {
          this.activetab = e.detail as ProfileTab;

          if (e.detail === (ProfileTab.Browser as string)) {
            this.openBrowser();
          } else {
            this.initialNavigateUrl = "";
          }
        }}
      >
        <btrix-tab-group-tab slot="nav" panel=${ProfileTab.Config} class="mb-3">
          <sl-icon name="window-stack"></sl-icon>
          ${msg("Visited Sites")}
        </btrix-tab-group-tab>
        <btrix-tab-group-tab
          slot="nav"
          panel=${ProfileTab.Browser}
          class="mb-3"
        >
          <sl-icon name="clipboard-check-fill"></sl-icon>
          ${msg("Inspect Profile")}
        </btrix-tab-group-tab>
        <btrix-tab-group-panel name=${ProfileTab.Config}>
          ${this.renderOrigins()}
        </btrix-tab-group-panel>
        ${when(
          !this.configuringProfile,
          () => html`
            <sl-tooltip slot="action" content=${msg("Configure Profile")}>
              <sl-icon-button
                name="gear"
                class="text-base"
                @click=${() => (this.openDialog = "config")}
              ></sl-icon-button>
            </sl-tooltip>
          `,
        )}
        <btrix-tab-group-panel name=${ProfileTab.Browser}>
          <div class="overflow-hidden rounded-lg border">
            ${showBrowser
              ? html`<btrix-profile-browser
                  browserId=${this.browserIdTask.value}
                  initialNavigateUrl=${ifDefined(this.initialNavigateUrl)}
                  .origins=${this.profileTask.value.origins}
                  @btrix-browser-load=${this.onBrowserLoad}
                  @btrix-browser-reload=${this.onBrowserReload}
                  @btrix-browser-error=${this.onBrowserError}
                  @btrix-browser-connection-change=${this
                    .onBrowserConnectionChange}
                  readOnly
                ></btrix-profile-browser> `
              : html`<div class="h-10"></div>
                  <div class="aspect-4/3 bg-neutral-50"></div>`}
          </div>

          ${when(this.configuringProfile, this.renderProfileControls)}
        </btrix-tab-group-panel>
      </btrix-tab-group>
    `;
  }
  private readonly renderProfileControls = () => {
    return html`
      <div
        class="flex-0 sticky bottom-2 -mx-1 mt-2 flex justify-between rounded-lg border bg-neutral-0 p-4 shadow"
      >
        <sl-button
          size="small"
          @click=${() => (this.configuringProfile = false)}
        >
          ${msg("Cancel")}
        </sl-button>
        <div>
          <sl-button variant="primary" size="small" @click=${console.log}>
            ${msg("Save Profile")}
          </sl-button>
        </div>
      </div>
    `;
  };

  private renderOrigins() {
    const originsSkeleton = () => html`<div class="h-9 rounded border"></div>`;

    const origins = (profile: Profile) =>
      profile.origins.map(
        (origin) => html`
          <li
            class="flex items-center leading-none transition-colors hover:bg-cyan-50/50"
          >
            <sl-tooltip placement="left" content=${msg("Inspect in Profile")}>
              <button
                class="flex flex-1 items-center gap-2 truncate p-2 text-neutral-700 hover:text-cyan-700"
                @click=${() => {
                  this.initialNavigateUrl = origin;
                  this.activetab = ProfileTab.Browser;
                  this.openBrowser();
                }}
              >
                <div>
                  <sl-icon
                    name="clipboard-check"
                    label=${msg("Enter Profile")}
                  ></sl-icon>
                </div>
                <btrix-code language="url" value=${origin} nowrap></btrix-code>
              </button>
            </sl-tooltip>
            <div class="flex items-center gap-0.5">
              <btrix-copy-button .value=${origin} placement="left">
              </btrix-copy-button>
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
                `${this.localize.number(profile.origins.length)} ${pluralOf("URLs", profile.origins.length)}`,
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

    this.tabGroup?.scrollIntoView();
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

  private async createBrowser(
    params: { url: string; profileId: string },
    signal: AbortSignal,
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
