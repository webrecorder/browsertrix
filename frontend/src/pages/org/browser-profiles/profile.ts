import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import capitalize from "lodash/fp/capitalize";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import type {
  BtrixFilterChipChangeEvent,
  FilterChip,
} from "@/components/ui/filter-chip";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import { ClipboardController } from "@/controllers/clipboard";
import { CrawlStatus } from "@/features/archived-items/crawl-status";
import type { WorkflowColumnName } from "@/features/crawl-workflows/workflow-list";
import { none } from "@/layouts/empty";
import { emptyMessage } from "@/layouts/emptyMessage";
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

  private get profile() {
    return this.profileTask.value;
  }

  private readonly profileTask = new Task(this, {
    task: async ([profileId], { signal }) => {
      return this.getProfile(profileId, signal);
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
      title: html`${this.profile?.name ??
      html`<sl-skeleton class="h-8 w-12" effect="sheen"></sl-skeleton>`}
      ${when(
        this.appState.isCrawler,
        () =>
          html`<sl-tooltip content=${msg("Edit Name")} placement="right">
            <sl-icon-button
              class="ml-1 text-base"
              name="pencil"
            ></sl-icon-button>
          </sl-tooltip>`,
      )} `,
      secondary: this.profileTask.render({
        complete: (profile) => {
          const isBackedUp =
            profile.resource?.replicas && profile.resource.replicas.length > 0;

          return html`<div class="flex flex-wrap gap-3 whitespace-nowrap">
            <btrix-badge variant=${profile.inUse ? "primary" : "neutral"}>
              <sl-icon
                name=${profile.inUse ? "check-circle" : "dash-circle"}
                class="mr-1.5"
              ></sl-icon>
              ${profile.inUse ? msg("In Use") : msg("Not In Use")}
            </btrix-badge>
            <btrix-badge variant=${isBackedUp ? "cyan" : "neutral"}>
              <sl-icon
                name=${isBackedUp ? "clouds-fill" : "cloud-slash-fill"}
                class="mr-1.5"
              ></sl-icon>
              ${isBackedUp ? msg("Backed Up") : msg("Not Backed Up")}
            </btrix-badge>
          </div> `;
        },
      }),
      actions: this.renderActions(),
    } satisfies Parameters<typeof page>[0];

    return html`${page(header, this.renderPage)}`;
  }

  private renderActions() {
    const archivingDisabled = isArchivingDisabled(this.org);

    return html`
      <sl-dropdown distance="4" placement="bottom-end">
        <sl-button size="small" slot="trigger" caret>
          ${msg("Actions")}
        </sl-button>
        <sl-menu>
          <sl-menu-item ?disabled=${archivingDisabled} @click=${() => {}}>
            <sl-icon slot="prefix" name="clipboard-check-fill"></sl-icon>
            ${msg("Inspect Profile")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          ${when(
            this.appState.isCrawler,
            () => html`
              <sl-menu-item ?disabled=${archivingDisabled} @click=${() => {}}>
                <sl-icon slot="prefix" name="gear"></sl-icon>
                ${msg("Configure Profile")}
              </sl-menu-item>
              <sl-menu-item @click=${() => {}}>
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
      <div class="grid grid-cols-7 gap-7 lg:mt-2">
        <div class="col-span-full flex flex-col gap-7 lg:col-span-5">
          ${this.renderConfig()} ${this.renderUsage()}
        </div>

        <div class="col-span-full lg:col-span-2">${this.renderOverview()}</div>
      </div>
    `;
  };

  private renderConfig() {
    const siteListSkeleton = () =>
      html`<sl-skeleton effect="sheen" class="h-7"></sl-skeleton>`;

    const settings = html`<div class="mt-5">
      <btrix-desc-list>
        <btrix-desc-list-item label=${msg("Crawler Release Channel")}>
          ${this.renderDetail((profile) =>
            profile.crawlerChannel ? capitalize(profile.crawlerChannel) : none,
          )}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Proxy")}>
          ${this.renderDetail((profile) =>
            profile.proxyId ? profile.proxyId : none,
          )}
        </btrix-desc-list-item>
      </btrix-desc-list>
    </div>`;

    const origins = html`
      <section>
        <h3 class="mb-1.5 text-xs text-neutral-500">${msg("Visited Sites")}</h3>
        <ul class="divided rounded border bg-white shadow-sm">
          ${this.profileTask.render({
            initial: siteListSkeleton,
            pending: siteListSkeleton,
            complete: (profile) =>
              profile.origins.map(
                (origin) => html`
                  <li
                    class="flex items-center leading-none transition-colors hover:bg-cyan-50/50"
                  >
                    <sl-tooltip
                      placement="left"
                      content=${msg("Inspect in Profile")}
                    >
                      <button
                        class="flex flex-1 items-center gap-2 truncate p-2 text-neutral-700 hover:text-cyan-700"
                      >
                        <div>
                          <sl-icon
                            name="clipboard-check"
                            label=${msg("Enter Profile")}
                          ></sl-icon>
                        </div>
                        <btrix-code
                          language="url"
                          value=${origin}
                          nowrap
                        ></btrix-code>
                      </button>
                    </sl-tooltip>
                    <div class="flex items-center gap-0.5">
                      <btrix-copy-button .value=${origin} placement="left">
                      </btrix-copy-button>
                      <sl-tooltip
                        placement="right"
                        content=${msg("Open in New Tab")}
                      >
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
              ),
          })}
        </ul>
      </section>
    `;

    return panel({
      heading: msg("Configuration"),
      actions: html`
        <div class="flex items-center gap-1">
          ${this.appState.isCrawler
            ? html`<sl-tooltip content=${msg("Configure Profile")}>
                <sl-icon-button class="text-base" name="gear"></sl-icon-button>
              </sl-tooltip>`
            : undefined}

          <sl-button size="small">
            <sl-icon slot="prefix" name="clipboard-check-fill"></sl-icon>
            ${msg("Inspect")}
          </sl-button>
        </div>
      `,
      body: panelBody({ content: html` ${origins} ${settings} ` }),
    });
  }

  private renderOverview() {
    return panel({
      heading: msg("Overview"),
      actions: this.appState.isCrawler
        ? html`<sl-tooltip content=${msg("Edit Metadata")}>
            <sl-icon-button class="text-base" name="pencil"></sl-icon-button>
          </sl-tooltip>`
        : undefined,
      body: html`
        <btrix-desc-list>
          <btrix-desc-list-item label=${msg("Description")}>
            ${this.renderDetail((profile) =>
              profile.description
                ? html`
                    <div
                      class="text-balanced font-sans leading-relaxed text-neutral-700"
                    >
                      ${profile.description}
                    </div>
                  `
                : stringFor.none,
            )}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Tags")}>
            ${this.renderDetail(() => html`${stringFor.none}`)}
          </btrix-desc-list-item>
        </btrix-desc-list>
        <sl-divider class="my-5"></sl-divider>
        <btrix-desc-list>
          <btrix-desc-list-item label=${msg("Size")}>
            ${this.renderDetail((profile) =>
              this.localize.bytes(profile.resource?.size || 0),
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
        </btrix-desc-list>
      `,
    });
  }

  private renderUsage() {
    const workflowListSkeleton = () =>
      html`<sl-skeleton class="h-36" effect="sheen"></sl-skeleton>`;

    return panel({
      heading: msg("Usage"),
      body: html`${this.profileTask.render({
        initial: workflowListSkeleton,
        pending: workflowListSkeleton,
        complete: (profile) =>
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
            : html`${emptyMessage({
                message: msg("Not used by any crawl workflows."),
                actions: html`<sl-button size="small">
                  <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                  ${msg("Create Workflow Using Profile")}</sl-button
                >`,
              })}`,
      })}`,
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

  private async getProfile(profileId: string, signal: AbortSignal) {
    const data = await this.api.fetch<Profile>(
      `/orgs/${this.orgId}/profiles/${profileId}`,
      { signal },
    );

    return data;
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
