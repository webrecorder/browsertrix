import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlMenuItem } from "@shoelace-style/shoelace";
import { html, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type {
  BtrixFilterChipChangeEvent,
  FilterChip,
} from "@/components/ui/filter-chip";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import { ClipboardController } from "@/controllers/clipboard";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import type { BtrixStartBrowserEvent } from "@/features/browser-profiles/start-browser-dialog";
import {
  badges,
  badgesSkeleton,
} from "@/features/browser-profiles/templates/badges";
import type { ProfileUpdatedEvent } from "@/features/browser-profiles/types";
import type { WorkflowColumnName } from "@/features/crawl-workflows/workflow-list";
import { emptyMessage } from "@/layouts/emptyMessage";
import { labelWithIcon } from "@/layouts/labelWithIcon";
import { page } from "@/layouts/page";
import { panel, panelBody } from "@/layouts/panel";
import { OrgTab, WorkflowTab } from "@/routes";
import { noData, stringFor } from "@/strings/ui";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { Profile, Workflow } from "@/types/crawler";
import type { CrawlState } from "@/types/crawlState";
import { SortDirection } from "@/types/utils";
import { isApiError } from "@/utils/api";
import { settingsForDuplicate } from "@/utils/crawl-workflows/settingsForDuplicate";
import { isNotEqual } from "@/utils/is-not-equal";
import { isArchivingDisabled } from "@/utils/orgs";
import { pluralOf } from "@/utils/pluralize";
import { tw } from "@/utils/tailwind";
import type { SectionsEnum } from "@/utils/workflow";

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
    | "start-browser"
    | "start-browser-add-site"
    | "browser"
    | "duplicate";

  @state()
  private browserLoadUrl?: string;

  @state()
  private browserLoadCrawlerChannel?: Profile["crawlerChannel"];

  /**
   * Render updated fields before refreshing data from API
   */
  @state()
  private updatedProfileParams?: ProfileUpdatedEvent["detail"];

  private get profile() {
    return this.profileTask.value
      ? { ...this.profileTask.value, ...this.updatedProfileParams }
      : undefined;
  }

  private readonly profileTask = new Task(this, {
    task: async ([profileId], { signal }) => {
      const profile = await this.getProfile(profileId, signal);

      return profile;
    },
    args: () => [this.profileId] as const,
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
      title: this.profile?.name,
      suffix: when(
        this.profile && this.appState.isCrawler,
        () =>
          html`<sl-tooltip content=${msg("Edit Name")} placement="right">
            <sl-icon-button
              class="ml-1 hidden text-base md:block"
              name="pencil"
              @click=${() => (this.openDialog = "metadata-name")}
            ></sl-icon-button>
          </sl-tooltip>`,
      ),
      secondary: when(this.profile, badges, badgesSkeleton),
      actions: this.renderActions(),
    } satisfies Parameters<typeof page>[0];

    const duplicating = this.openDialog === "duplicate";

    return html`${page(header, this.renderPage)}

      <btrix-profile-browser-dialog
        .profile=${this.profile}
        .config=${this.browserLoadUrl
          ? {
              url: this.browserLoadUrl,
              name:
                duplicating && this.profile
                  ? `${this.profile.name} ${msg("Copy")}`
                  : undefined,
              crawlerChannel:
                (duplicating && this.profile?.crawlerChannel) ||
                this.browserLoadCrawlerChannel,
              proxyId: (duplicating && this.profile?.proxyId) || undefined,
            }
          : undefined}
        ?open=${this.openDialog === "browser" || duplicating}
        ?duplicating=${duplicating}
        @btrix-updated=${duplicating ? undefined : this.onUpdated}
        @sl-after-hide=${this.closeBrowser}
      >
      </btrix-profile-browser-dialog>

      ${when(
        this.profileTask.value,
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
            @btrix-updated=${(e: ProfileUpdatedEvent) => {
              void this.onUpdated(e);
              this.openDialog = undefined;
            }}
          >
          </btrix-profile-metadata-dialog> `,
      )} `;
  }

  private renderActions() {
    const archivingDisabled = isArchivingDisabled(this.org);
    const isCrawler = this.appState.isCrawler;
    const menuItemClick = (cb: () => void) => (e: MouseEvent) => {
      if (e.defaultPrevented || (e.currentTarget as SlMenuItem).disabled)
        return;
      cb();
    };

    return html`
      <sl-dropdown distance="4" placement="bottom-end">
        <sl-button size="small" slot="trigger" caret>
          ${msg("Actions")}
        </sl-button>
        <sl-menu>
          ${when(
            isCrawler,
            () => html`
              <sl-menu-item @click=${() => (this.openDialog = "metadata")}>
                <sl-icon slot="prefix" name="pencil"></sl-icon>
                ${msg("Edit Metadata")}
              </sl-menu-item>
              <sl-menu-item
                ?disabled=${archivingDisabled}
                @click=${menuItemClick(
                  () => (this.openDialog = "start-browser"),
                )}
              >
                <sl-icon slot="prefix" name="gear"></sl-icon>
                ${msg("Configure Profile")}
              </sl-menu-item>
              <sl-menu-item
                ?disabled=${archivingDisabled || !this.profile}
                @click=${menuItemClick(() => void this.duplicateProfile())}
              >
                <sl-icon slot="prefix" name="files"></sl-icon>
                ${msg("Duplicate Profile")}
              </sl-menu-item>
              <sl-divider></sl-divider>
              <sl-menu-item @click=${this.newWorkflow}>
                <sl-icon slot="prefix" name="file-code-fill"></sl-icon>
                ${msg("New Workflow with Profile")}
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
          ${when(isCrawler, () => {
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
      <div class="mt-2 grid grid-cols-7 gap-7">
        <div class="col-span-full flex flex-col gap-7 lg:col-span-5 lg:gap-10">
          ${this.renderProfile()} ${this.renderUsage()}
        </div>

        <div class="sticky top-3 col-span-full self-start lg:col-span-2">
          ${this.renderOverview()}
        </div>
      </div>
    `;
  };

  private renderProfile() {
    const archivingDisabled = isArchivingDisabled(this.org);
    const isCrawler = this.appState.isCrawler;

    return panel({
      heading: msg("Configured Sites"),
      actions: isCrawler
        ? html`<sl-tooltip content=${msg("Configure Profile")}>
            <sl-icon-button
              name="gear"
              class="text-base"
              @click=${() => (this.openDialog = "start-browser")}
              ?disabled=${archivingDisabled}
            ></sl-icon-button>
          </sl-tooltip>`
        : undefined,
      body: html`${this.renderOrigins()}
      ${when(
        isCrawler,
        () => html`
          <sl-button
            size="small"
            class="mt-3"
            @click=${() => (this.openDialog = "start-browser-add-site")}
          >
            <sl-icon slot="prefix" name="plus-square"></sl-icon>
            ${msg("Add Site")}</sl-button
          >
        `,
      )}
      ${when(
        this.profileTask.value,
        (profile) => html`
          <btrix-start-browser-dialog
            .profile=${profile}
            ?open=${Boolean(this.openDialog?.startsWith("start-browser"))}
            startUrl=${ifDefined(
              this.openDialog === "start-browser"
                ? profile.origins[0]
                : undefined,
            )}
            @btrix-start-browser=${(e: BtrixStartBrowserEvent) => {
              void this.openBrowser(e.detail);
            }}
            @sl-after-hide=${() => {
              if (this.openDialog?.startsWith("start-browser")) {
                this.openDialog = undefined;
              }
            }}
          ></btrix-start-browser-dialog>
        `,
      )} `,
    });
  }

  private renderOrigins() {
    const originsSkeleton = () =>
      html`<div class="h-8 rounded-lg border shadow-sm"></div>`;

    const origins = (profile: Profile) =>
      profile.origins.map(
        (origin) => html`
          <li class="flex items-center gap-2">
            <button
              class="flex h-8 flex-1 items-center overflow-hidden border-r text-left transition-colors duration-fast hover:bg-cyan-50/50"
              @click=${() => void this.openBrowser({ url: origin })}
            >
              <sl-tooltip placement="left" content=${msg("View")}>
                <sl-icon name="window-fullscreen" class="mx-2 block"></sl-icon>
              </sl-tooltip>
              <btrix-code
                class="block flex-1 truncate"
                language="url"
                value=${origin}
                nowrap
              ></btrix-code>
            </button>

            <div class="flex items-center gap-1">
              <btrix-copy-button
                content=${msg("Copy URL")}
                .value=${origin}
                placement="left"
              >
              </btrix-copy-button>
              <sl-tooltip placement="right" content=${msg("Open Live Site")}>
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
        <div class="relative">
          <ul class="divide-y rounded-lg border bg-white shadow-sm">
            ${origins(profile)}
          </ul>
        </div>
      `,
      originsSkeleton,
    );
  }

  private renderOverview() {
    const none = html`<span class="text-neutral-400">${stringFor.none}</span>`;
    const profile = this.profile;
    const modifiedByAnyDate = profile
      ? [profile.modifiedCrawlDate, profile.modified, profile.created].reduce(
          (a, b) => (b && a && b > a ? b : a),
          profile.created,
        )
      : null;

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
            ${this.renderDetail((profile) =>
              profile.tags.length
                ? html`<div class="mt-1 flex flex-wrap gap-x-2 gap-y-1">
                    ${profile.tags.map(
                      (tag) => html`<btrix-tag>${tag}</btrix-tag>`,
                    )}
                  </div>`
                : none,
            )}
          </btrix-desc-list-item>
        </btrix-desc-list>
        <sl-divider class="my-5"></sl-divider>
        <btrix-desc-list>
          <btrix-desc-list-item label=${msg("Size")}>
            ${this.renderDetail((profile) =>
              this.localize.bytes(profile.resource?.size || 0),
            )}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Site Count")}>
            ${this.renderDetail(
              (profile) =>
                `${this.localize.number(profile.origins.length)} ${pluralOf("domains", profile.origins.length)}`,
            )}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Last Modified")}>
            ${this.renderDetail((profile) =>
              this.localize.relativeDate(modifiedByAnyDate || profile.created),
            )}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Last Modified By")}>
            ${this.renderDetail((profile) => {
              let modifier: string | TemplateResult =
                profile.createdByName || msg("User");

              switch (modifiedByAnyDate) {
                case profile.modifiedCrawlDate:
                  modifier = html`
                    <btrix-link
                      href="${this.navigate
                        .orgBasePath}/${OrgTab.Workflows}/${profile.modifiedCrawlCid}/${WorkflowTab.Crawls}/${profile.modifiedCrawlId}"
                      >${msg("Workflow Crawl")}</btrix-link
                    >
                  `;
                  break;
                case profile.modified:
                  modifier = profile.modifiedByName || modifier;
                  break;
                default:
                  break;
              }

              return modifier;
            })}
          </btrix-desc-list-item>
          ${when(
            this.profile,
            (profile) =>
              modifiedByAnyDate === profile.modifiedCrawlDate
                ? html`<btrix-desc-list-item label=${msg("Last Saved By")}>
                    ${profile.modifiedByName}
                    <span class="inline-flex"
                      >(${this.localize.relativeDate(
                        profile.modified || profile.created,
                      )})</span
                    >
                  </btrix-desc-list-item>`
                : html`<btrix-desc-list-item label=${msg("Date Saved")}>
                    ${this.localize.date(profile.created, {
                      dateStyle: "medium",
                    })}
                  </btrix-desc-list-item>`,
            () =>
              html`<btrix-desc-list-item role="none">
                <sl-skeleton slot="label" class="w-32"></sl-skeleton>
                <sl-skeleton class="w-32"></sl-skeleton>
              </btrix-desc-list-item>`,
          )}

          <btrix-desc-list-item label=${msg("Date Created")}>
            ${this.renderDetail((profile) =>
              profile.created
                ? this.localize.date(profile.created, {
                    dateStyle: "medium",
                  })
                : noData,
            )}
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
      heading: msg("Related Workflows"),
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
                    <btrix-desc-list-item label=${msg("Modified by Crawl")}>
                      ${profile.modifiedCrawlId && profile.modifiedCrawlDate
                        ? html`
                            <div class="flex items-center gap-1.5">
                              ${this.localize.relativeDate(
                                profile.modifiedCrawlDate,
                              )}
                              <sl-tooltip
                                content=${msg("Open Crawl in New Tab")}
                                placement="bottom"
                                hoist
                              >
                                <sl-icon-button
                                  name="arrow-up-right"
                                  class="part-[base]:p-1"
                                  href="${this.navigate
                                    .orgBasePath}/${OrgTab.Workflows}/${profile.modifiedCrawlCid}/${WorkflowTab.Crawls}/${profile.modifiedCrawlId}"
                                  target="_blank"
                                ></sl-icon-button>
                              </sl-tooltip>
                            </div>
                          `
                        : msg("Never")}
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
                  actions: html`<div class="flex gap-2">
                    <sl-button
                      size="small"
                      href="${this.navigate.orgBasePath}/${OrgTab.Workflows}"
                      @click=${this.navigate.link}
                    >
                      <sl-icon slot="prefix" name="file-code-fill"></sl-icon>
                      ${msg("Manage Workflows")}
                    </sl-button>
                    <sl-button size="small" @click=${this.newWorkflow}>
                      <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                      ${msg("New Workflow with Profile")}
                    </sl-button>
                  </div>`,
                }),
              }),
        workflowListSkeleton,
      ),
    });
  }

  private readonly renderWorkflows = (
    workflows: APIPaginatedList<Workflow>,
  ) => {
    const failedStates = [
      "failed",
      "failed_not_logged_in",
    ] satisfies CrawlState[];

    return html`
      <div class="mb-3 rounded-lg border bg-neutral-50 px-5 py-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="whitespace-nowrap text-sm text-neutral-500">
            ${msg("Filter by:")}
          </span>

          <btrix-filter-chip
            ?checked=${this.workflowParams.lastCrawlState?.some((state) =>
              (failedStates as CrawlState[]).includes(state),
            )}
            @btrix-change=${(e: BtrixFilterChipChangeEvent) => {
              const { checked } = e.target as FilterChip;

              this.workflowParams = {
                ...this.workflowParams,
                lastCrawlState: checked ? failedStates : undefined,
              };
            }}
          >
            ${CrawlStatus.getContent({ state: "failed" }).label}
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
      () => html`<sl-skeleton class="w-32"></sl-skeleton>`,
    );

  private async getFirstBrowserUrl() {
    if (!this.profileTask.value) {
      await this.profileTask.taskComplete;
    }

    return this.profileTask.value?.origins[0];
  }

  private readonly onUpdated = async (e: ProfileUpdatedEvent) => {
    this.updatedProfileParams = e.detail;
    void this.profileTask.run();
  };

  private readonly newWorkflow = () => {
    this.navigate.to(
      `${this.navigate.orgBasePath}/${OrgTab.Workflows}/new#${"browserSettings" satisfies SectionsEnum}`,
      settingsForDuplicate({
        workflow: {
          profileid: this.profileId,
          proxyId: this.profile?.proxyId,
          crawlerChannel: this.profile?.crawlerChannel,
        },
      }),
    );

    this.notify.toast({
      message: msg("Copied browser settings to new workflow."),
      variant: "success",
      icon: "check2-circle",
      id: "workflow-copied-status",
      duration: 8000,
    });
  };

  private readonly openBrowser = async (opts: {
    url?: string;
    crawlerChannel?: string;
  }) => {
    let { url } = opts;

    if (!url) {
      url = await this.getFirstBrowserUrl();
    }
    this.browserLoadUrl = url;
    this.browserLoadCrawlerChannel = opts.crawlerChannel;
    this.openDialog = "browser";
  };

  private async getProfile(profileId: string, signal: AbortSignal) {
    return await this.api.fetch<Profile>(
      `/orgs/${this.orgId}/profiles/${profileId}`,
      { signal },
    );
  }

  private readonly closeBrowser = () => {
    this.browserLoadUrl = undefined;
    this.browserLoadCrawlerChannel = undefined;
    this.openDialog = undefined;
  };

  private async duplicateProfile() {
    this.browserLoadUrl = await this.getFirstBrowserUrl();
    this.openDialog = "duplicate";
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
