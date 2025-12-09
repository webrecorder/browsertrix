import { localized, msg, str } from "@lit/localize";
import { Task, TaskStatus } from "@lit/task";
import clsx, { type ClassValue } from "clsx";
import { html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import capitalize from "lodash/fp/capitalize";
import queryString from "query-string";

import { badges, badgesSkeleton } from "./templates/badges";

import { BtrixElement } from "@/classes/BtrixElement";
import { type Dialog } from "@/components/ui/dialog";
import { ClipboardController } from "@/controllers/clipboard";
import type { CrawlMetadataEditor } from "@/features/archived-items/item-metadata-editor";
import { dedupeFilesNotice } from "@/features/archived-items/templates/dedupe-files-notice";
import { dedupeQANotice } from "@/features/archived-items/templates/dedupe-qa-notice";
import { dedupeReplayNotice } from "@/features/archived-items/templates/dedupe-replay-notice";
import { emptyMessage } from "@/layouts/emptyMessage";
import {
  pageBack,
  pageHeader,
  pageNav,
  type Breadcrumb,
} from "@/layouts/pageHeader";
import { panelBody } from "@/layouts/panel";
import { CommonTab, OrgTab, WorkflowTab } from "@/routes";
import type { APIPaginatedList } from "@/types/api";
import type {
  ArchivedItem,
  Crawl,
  CrawlConfig,
  CrawlReplay,
  Seed,
  Workflow,
} from "@/types/crawler";
import type { QARun } from "@/types/qa";
import { SortDirection } from "@/types/utils";
import type { StorageSeedFile } from "@/types/workflow";
import { isApiError } from "@/utils/api";
import {
  isActive,
  isCrawl,
  isCrawlReplay,
  isNotFailed,
  isSuccessfullyFinished,
  renderName,
} from "@/utils/crawler";
import { humanizeExecutionSeconds } from "@/utils/executionTimeFormatter";
import { isArchivingDisabled } from "@/utils/orgs";
import { pluralOf } from "@/utils/pluralize";
import { richText } from "@/utils/rich-text";
import { tw } from "@/utils/tailwind";

import "./templates/qa";

const SECTIONS = [
  "overview",
  "qa",
  "replay",
  "files",
  "logs",
  "config",
  "dependencies",
] as const;
type SectionName = (typeof SECTIONS)[number];

const POLL_INTERVAL_SECONDS = 5;

export type { SectionName as ArchivedItemSectionName };

/**
 * Detail page for an archived item (crawl or upload) or crawl run.
 *
 * Note: The component name is somewhat misleading, since this component
 * can also be used to display crawl runs that did not result in a
 * definitive archived item.
 */
@customElement("btrix-archived-item-detail")
@localized()
export class ArchivedItemDetail extends BtrixElement {
  @property({ type: String })
  itemType: ArchivedItem["type"] = "crawl";

  @property({ type: String })
  collectionId?: string;

  @property({ type: String })
  workflowId?: string;

  @property({ type: Boolean })
  showOrgLink = false;

  @property({ type: String })
  itemId?: string;

  @property({ type: Boolean })
  isCrawler = false;

  @property({ type: String })
  qaTab?: string;

  @state()
  private qaRunId?: string;

  @state()
  private isRunActive = false;

  @state()
  qaRuns?: QARun[];

  @state()
  item?: ArchivedItem;

  @state()
  private workflow?: Workflow;

  @state()
  private seeds?: APIPaginatedList<Seed>;

  @state()
  activeTab: SectionName = "overview";

  @state()
  private openDialogName?: "scale" | "metadata" | "exclusions" | "delete";

  @state()
  mostRecentNonFailedQARun?: QARun;

  @state()
  private mostRecentSuccessQARun?: QARun;

  @query("#stopQARunDialog")
  private readonly stopQARunDialog?: Dialog | null;

  @query("#cancelQARunDialog")
  private readonly cancelQARunDialog?: Dialog | null;

  @query("btrix-item-metadata-editor")
  private readonly editDialog?: CrawlMetadataEditor | null;

  private readonly tabLabels: Omit<
    Record<SectionName, string>,
    "watch" | "exclusions"
  > = {
    overview: msg("Overview"),
    qa: msg("Quality Assurance"),
    replay: msg("Replay"),
    files: msg("WACZ Files"),
    logs: msg("Logs"),
    config: msg("Crawl Settings"),
    dependencies: msg("Dependencies"),
  };

  private get listUrl(): string {
    let path = "items";
    if (this.workflowId) {
      path = `${OrgTab.Workflows}/${this.workflowId}/${WorkflowTab.Crawls}`;
    } else if (this.collectionId) {
      path = `collections/view/${this.collectionId}/items`;
    } else if (this.item?.type === "upload") {
      path = "items/upload";
    } else if (this.item?.type === "crawl") {
      path = "items/crawl";
    }
    return `${this.navigate.orgBasePath}/${path}`;
  }

  private get reviewUrl(): string {
    return `${new URL(window.location.href).pathname}/review/screenshots${this.mostRecentSuccessQARun ? `?qaRunId=${this.mostRecentSuccessQARun.id}` : ""}`;
  }

  private get dependenciesUrl(): string {
    return `${new URL(window.location.href).pathname}${window.location.search}#${"dependencies" satisfies SectionName}`;
  }

  private timerId?: number;

  private get hasFiles(): boolean | null {
    if (!this.item) return null;
    if (!this.item.resources) return false;

    return this.item.resources.length > 0;
  }

  private get formattedFinishedDate() {
    if (!this.item) return;

    return html`<btrix-format-date
      date=${this.item.finished!}
      month="2-digit"
      day="2-digit"
      year="numeric"
      hour="numeric"
      minute="numeric"
      time-zone-name="short"
    ></btrix-format-date>`;
  }

  private readonly seedFileTask = new Task(this, {
    task: async ([item], { signal }) => {
      if (!item) return;
      if (!isCrawlReplay(item)) return;
      if (!item.config.seedFileId) return null;

      return await this.getSeedFile(item.config.seedFileId, signal);
    },
    args: () => [this.item] as const,
  });

  private readonly dependenciesTask = new Task(this, {
    task: async ([item], { signal }) => {
      if (!item) return;
      if (!isCrawlReplay(item)) return;
      if (!item.requiresCrawls.length) return;

      const query = queryString.stringify(
        {
          ids: item.requiresCrawls,
          sortBy: "started",
          sortDirection: SortDirection.Descending,
        },
        {
          arrayFormat: "comma",
        },
      );

      return this.api.fetch<APIPaginatedList<Crawl>>(
        `/orgs/${this.orgId}/crawls?${query}`,
        { signal },
      );
    },
    args: () => [this.item] as const,
  });

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("itemId") && this.itemId) {
      if (changedProperties.get("itemId")) {
        this.resetItem();
      }
      void this.fetchCrawl();
      if (this.itemType === "crawl") {
        void this.fetchSeeds();
        void this.fetchQARuns();
      }
    } else if (changedProperties.get("activeTab")) {
      if (this.activeTab === "qa") {
        void this.fetchQARuns();
      }
    }
    if (
      (changedProperties.has("workflowId") && this.workflowId) ||
      (!this.workflowId && changedProperties.has("item") && this.item?.cid)
    ) {
      if (changedProperties.get("workflowId")) {
        this.workflow = undefined;
      }
      void this.fetchWorkflow();
    }
    if (changedProperties.has("qaRuns")) {
      // Latest QA run that's either running or finished:
      this.mostRecentNonFailedQARun = this.qaRuns?.find((run) =>
        isNotFailed(run),
      );
      this.mostRecentSuccessQARun = this.qaRuns?.find((run) =>
        isSuccessfullyFinished(run),
      );
    }
    if (
      (changedProperties.has("qaRuns") ||
        changedProperties.has("mostRecentNonFailedQARun")) &&
      this.qaRuns
    ) {
      if (!this.qaRunId) {
        this.qaRunId = this.qaRuns.find((run) => isNotFailed(run))?.id;
      }
    }

    if (
      this.itemType === "crawl" &&
      changedProperties.has("item") &&
      this.item
    ) {
      if (this.workflowId) {
        if (this.item.type === "crawl" && isActive(this.item)) {
          // Items can technically be "running" on the backend, but only
          // workflows should be considered running by the frontend
          this.navigate.to(
            `${this.navigate.orgBasePath}/workflows/${this.item.cid}/${WorkflowTab.LatestCrawl}`,
            undefined,
            undefined,
            true,
          );
        }
      } else {
        // If item is a crawl and workflow ID isn't set, redirect to item page with workflow prefix
        if (this.qaTab) {
          // QA review open
          this.navigate.to(
            `${this.navigate.orgBasePath}/workflows/${this.item.cid}/crawls/${this.item.id}/review/${this.qaTab}${location.search}`,
            undefined,
            undefined,
            true,
          );
        } else {
          this.navigate.to(
            `${this.navigate.orgBasePath}/workflows/${this.item.cid}/crawls/${this.item.id}#${this.activeTab}`,
            undefined,
            undefined,
            true,
          );
        }
      }
    }
  }

  private resetItem() {
    const hashValue = window.location.hash.slice(1);
    if (SECTIONS.includes(hashValue as (typeof SECTIONS)[number])) {
      this.activeTab = hashValue as SectionName;
    } else {
      this.activeTab = "overview";
    }

    this.item = undefined;
    this.seeds = undefined;
    this.isRunActive = false;
    this.qaRuns = undefined;
    this.mostRecentNonFailedQARun = undefined;
    this.mostRecentSuccessQARun = undefined;
  }

  connectedCallback(): void {
    // Set initial active section based on URL #hash value
    const hash = window.location.hash.slice(1);
    if ((SECTIONS as readonly string[]).includes(hash)) {
      this.activeTab = hash as SectionName;
    } else {
      const newLocation = new URL(window.location.toString());
      newLocation.hash = this.activeTab;
      window.history.replaceState(undefined, "", newLocation);
    }
    super.connectedCallback();
    window.addEventListener("hashchange", this.getActiveTabFromHash);
  }

  disconnectedCallback(): void {
    this.stopPoll();
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.getActiveTabFromHash);
  }

  // TODO this should be refactored out into the API router or something, it's
  // mostly copied from frontend/src/pages/org/workflow-detail.ts
  private readonly getActiveTabFromHash = async () => {
    await this.updateComplete;

    const hashValue = window.location.hash.slice(1);
    if (SECTIONS.includes(hashValue as (typeof SECTIONS)[number])) {
      this.activeTab = hashValue as SectionName;
    } else {
      this.goToTab(this.activeTab, { replace: true });
    }
  };

  private goToTab(tab: SectionName, { replace = false } = {}) {
    const path = `${window.location.href.split("#")[0]}#${tab}`;
    if (replace) {
      window.history.replaceState(null, "", path);
    } else {
      window.history.pushState(null, "", path);
    }
    this.activeTab = tab;
  }

  render() {
    const authToken = this.authState?.headers.Authorization.split(" ")[1];
    const isSuccess = this.item && isSuccessfullyFinished(this.item);
    const dedupeDependent =
      this.item && isCrawl(this.item) && this.item.requiresCrawls.length;

    let sectionContent: string | TemplateResult<1> = "";

    switch (this.activeTab) {
      case "qa": {
        if (!this.isCrawler) {
          sectionContent = "";
          break;
        }
        sectionContent = this.renderPanel(
          html`${this.renderTitle(
              html`${this.tabLabels.qa} <btrix-beta-badge></btrix-beta-badge>`,
            )}
            <div class="ml-auto flex flex-wrap justify-end gap-2">
              ${when(!dedupeDependent && this.qaRuns, this.renderQAHeader)}
            </div> `,
          html`
            ${dedupeDependent
              ? dedupeQANotice({
                  dependenciesHref: this.dependenciesUrl,
                })
              : nothing}
            <btrix-archived-item-detail-qa
              .crawlId=${this.itemId}
              .workflowId=${this.workflowId}
              .crawl=${this.item}
              .qaRuns=${this.qaRuns}
              .qaRunId=${this.qaRunId}
              .mostRecentNonFailedQARun=${this.mostRecentNonFailedQARun}
              .mostRecentSuccessQARun=${this.mostRecentSuccessQARun}
              @btrix-qa-runs-update=${() => void this.fetchQARuns()}
            ></btrix-archived-item-detail-qa>
          `,
        );
        break;
      }
      case "replay":
        sectionContent = this.renderPanel(
          this.tabLabels.replay,
          this.renderReplay(),
        );
        break;
      case "files":
        sectionContent = this.renderPanel(
          html` ${this.renderTitle(this.tabLabels.files)}
            <sl-tooltip
              content=${msg("Download all files as a single WACZ file")}
            >
              <sl-button
                href=${`/api/orgs/${this.orgId}/all-crawls/${this.itemId}/download?auth_bearer=${authToken}&preferSingleWACZ=true`}
                download=${`browsertrix-${this.itemId}.wacz`}
                size="small"
                variant="primary"
              >
                <sl-icon slot="prefix" name="cloud-download"></sl-icon>
                ${msg("Download All")}
              </sl-button>
            </sl-tooltip>`,
          this.renderFiles(),
        );
        break;
      case "logs":
        sectionContent = this.renderPanel(
          html` ${this.renderTitle(this.tabLabels.logs)}
            <sl-tooltip content=${msg("Download Entire Log File")}>
              <sl-button
                href=${`/api/orgs/${this.orgId}/crawls/${this.itemId}/logs?auth_bearer=${authToken}`}
                download=${`browsertrix-${this.itemId}-logs.log`}
                size="small"
                variant="primary"
              >
                <sl-icon slot="prefix" name="file-earmark-arrow-down"></sl-icon>
                ${msg("Download Logs")}
              </sl-button>
            </sl-tooltip>`,
          this.renderLogs(),
        );
        break;
      case "config":
        sectionContent = this.renderPanel(
          html`
            ${this.renderTitle(html`
              ${this.tabLabels.config}
              <sl-tooltip
                content=${msg("Workflow settings used to run this crawl")}
              >
                <sl-icon
                  class="align-[-.175em] text-base text-neutral-500"
                  name="info-circle"
                ></sl-icon>
              </sl-tooltip>
            `)}
            <sl-button
              size="small"
              variant="primary"
              href="${this.navigate.orgBasePath}/workflows/${this.item
                ?.cid}?edit"
              ?disabled=${!this.item}
              @click=${this.navigate.link}
            >
              <sl-icon slot="prefix" name="gear"></sl-icon>
              ${msg("Edit Workflow")}
            </sl-button>
          `,
          this.renderConfig(),
          [tw`rounded-lg border p-4`],
        );
        break;
      case "dependencies":
        sectionContent = this.renderPanel(
          html` ${this.renderTitle(msg("Dependencies"))} `,
          this.renderDependencies(),
        );
        break;
      default:
        sectionContent = html`
          <div
            class="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:grid-rows-[auto_1fr]"
          >
            <div class="col-span-1 row-span-1 flex flex-col lg:row-span-2">
              ${this.renderPanel(msg("Overview"), this.renderOverview(), [
                tw`rounded-lg border p-4`,
              ])}
            </div>
            <div
              class=${clsx(
                tw`col-span-1 flex flex-col`,
                isSuccess ? tw`row-span-1` : tw`row-span-2`,
              )}
            >
              ${this.renderPanel(
                html`
                  ${this.renderTitle(msg("Metadata"))}
                  ${when(
                    this.isCrawler,
                    () => html`
                      <sl-icon-button
                        class="text-base"
                        name="pencil"
                        @click=${() => this.openMetadataEditor("metadata")}
                        label=${msg("Edit Metadata")}
                      ></sl-icon-button>
                    `,
                  )}
                `,
                this.renderMetadata(),
                [tw`rounded-lg border p-4`],
              )}
            </div>
            ${when(
              isSuccess,
              () => html`
                <div class="col-span-1 row-span-1 flex flex-col">
                  ${this.renderPanel(
                    html`
                      ${this.renderTitle(msg("Collections"))}
                      ${when(
                        this.isCrawler && isSuccess,
                        () => html`
                          <sl-icon-button
                            class="text-base"
                            name="pencil"
                            @click=${() =>
                              this.openMetadataEditor("collections")}
                            label=${msg("Edit Collections")}
                          ></sl-icon-button>
                        `,
                      )}
                    `,
                    this.renderCollections(),
                  )}
                </div>
              `,
            )}
          </div>
        `;
        break;
    }

    return html`
      <div class="mb-7">${this.renderBreadcrumbs()}</div>
      <div class="mb-4">${this.renderHeader()}</div>

      <main>
        <section class="grid gap-6 md:grid-cols-14">
          <div
            class="col-span-14 grid min-w-0 border-b md:col-span-3 md:border-b-0"
          >
            <div class="-mx-3 box-border flex overflow-x-auto px-3 md:block ">
              ${this.renderNav()}
            </div>
          </div>
          <div class="col-span-14 min-w-0 md:col-span-11">
            ${sectionContent}
          </div>
        </section>
      </main>

      <btrix-item-metadata-editor
        .crawl=${this.item}
        ?open=${this.openDialogName === "metadata"}
        @request-close=${() => (this.openDialogName = undefined)}
        @updated=${() => void this.fetchCrawl()}
      ></btrix-item-metadata-editor>

      <btrix-delete-item-dialog
        .item=${this.item}
        ?open=${this.openDialogName === "delete"}
        @sl-hide=${() => (this.openDialogName = undefined)}
        @btrix-confirm=${() => {
          this.openDialogName = undefined;
          void this.deleteCrawl();
        }}
      >
        ${this.item?.finished && isCrawl(this.item)
          ? html`<strong slot="name" class="font-semibold"
              >${renderName(this.item)}
              (${this.localize.date(this.item.finished)})</strong
            >`
          : nothing}
      </btrix-delete-item-dialog>
    `;
  }

  private renderBreadcrumbs() {
    const breadcrumbs: Breadcrumb[] = [];

    if (this.itemType === "crawl") {
      breadcrumbs.push(
        {
          href: `${this.navigate.orgBasePath}/workflows`,
          content: msg("Workflows"),
        },
        {
          href: `${this.navigate.orgBasePath}/workflows/${this.item?.cid}`,
          content: this.workflow ? renderName(this.workflow) : undefined,
        },
        {
          href: `${this.navigate.orgBasePath}/workflows/${this.item?.cid}/${WorkflowTab.Crawls}`,
          content: msg("Crawls"),
        },
      );

      if (this.item) {
        breadcrumbs.push({
          content: this.formattedFinishedDate,
        });
      }
    } else {
      breadcrumbs.push({
        href: `${this.navigate.orgBasePath}/items`,
        content: msg("Archived Items"),
      });

      breadcrumbs.push(
        {
          href: `${this.navigate.orgBasePath}/items/upload`,
          content: msg("Uploads"),
        },
        {
          content: this.item ? renderName(this.item) : undefined,
        },
      );
    }

    const renderCollection = () => {
      const breadcrumb = {
        href: `${this.navigate.orgBasePath}/collections`,
        content: msg("Collections"),
      };

      const collection = this.item?.collections.find(
        ({ id }) => id === this.collectionId,
      );

      if (collection?.name) {
        breadcrumb.href = `${this.navigate.orgBasePath}/collections/view/${this.collectionId}`;
        breadcrumb.content = collection.name;
      }

      return html`
        <div class="mb-3 border-b pb-3">${pageBack(breadcrumb)}</div>
      `;
    };

    return html`
      ${when(this.collectionId, renderCollection)} ${pageNav(breadcrumbs)}
    `;
  }

  private renderNav() {
    const renderNavItem = ({
      section,
      iconLibrary,
      icon,
      detail,
    }: {
      section: SectionName;
      iconLibrary: "app" | "default";
      icon: string;
      detail?: TemplateResult<1>;
    }) => {
      const isActive = section === this.activeTab;
      const baseUrl = window.location.pathname.split("#")[0];
      return html`
        <btrix-navigation-button
          class="whitespace-nowrap md:whitespace-normal"
          .active=${isActive}
          href=${`${baseUrl}${window.location.search}#${section}`}
          @click=${() => {
            this.activeTab = section;
          }}
          ><sl-icon
            class="size-4 shrink-0"
            name=${icon}
            aria-hidden="true"
            library=${iconLibrary}
          ></sl-icon>
          ${this.tabLabels[section]}${detail}</btrix-navigation-button
        >
      `;
    };
    return html`
      <nav
        class="sticky top-0 -mx-3 flex flex-row gap-2 overflow-x-auto px-3 pb-4 text-center md:flex-col md:text-start"
        role="menu"
      >
        ${renderNavItem({
          section: "overview",
          iconLibrary: "default",
          icon: "info-circle-fill",
        })}
        ${when(this.item, (item) =>
          isSuccessfullyFinished(item)
            ? html`
                ${when(
                  this.itemType === "crawl" && this.isCrawler,
                  () => html`
                    ${renderNavItem({
                      section: "qa",
                      iconLibrary: "default",
                      icon: "clipboard2-data-fill",
                      detail: html`<btrix-beta-icon></btrix-beta-icon>`,
                    })}
                  `,
                )}
                ${renderNavItem({
                  section: "replay",
                  iconLibrary: "app",
                  icon: "replaywebpage",
                })}
                ${renderNavItem({
                  section: "files",
                  iconLibrary: "default",
                  icon: "folder-fill",
                })}
              `
            : nothing,
        )}
        ${when(
          this.itemType === "crawl",
          () => html`
            ${renderNavItem({
              section: "logs",
              iconLibrary: "default",
              icon: "terminal-fill",
            })}
            ${renderNavItem({
              section: "config",
              iconLibrary: "default",
              icon: "file-code-fill",
            })}
            ${this.item &&
            isCrawlReplay(this.item) &&
            this.item.requiresCrawls.length
              ? renderNavItem({
                  section: "dependencies",
                  iconLibrary: "default",
                  icon: "layers-fill",
                })
              : nothing}
          `,
        )}
      </nav>
    `;
  }

  private renderHeader() {
    return pageHeader({
      title: this.item ? renderName(this.item) : undefined,
      secondary: when(this.item, badges, badgesSkeleton),
      actions: this.isCrawler
        ? this.item
          ? this.renderMenu()
          : html`<sl-skeleton
              class="h-8 w-24 [--border-radius:theme(borderRadius.sm)]"
            ></sl-skeleton>`
        : undefined,
    });
  }

  private renderMenu() {
    if (!this.item) return;

    const authToken = this.authState?.headers.Authorization.split(" ")[1];
    const isSuccess = isSuccessfullyFinished(this.item);
    const isCrawlType = this.itemType === "crawl";
    const isWorkflowCrawl = this.item.cid === this.workflowId;

    return html`
      <sl-dropdown placement="bottom-end" distance="4" hoist>
        <sl-button slot="trigger" size="small" caret
          >${msg("Actions")}</sl-button
        >
        <sl-menu>
          ${when(
            this.isCrawler,
            () => html`
              <sl-menu-item @click=${this.openMetadataEditor}>
                <sl-icon name="pencil" slot="prefix"></sl-icon>
                ${isSuccess ? msg("Edit Archived Item") : msg("Edit Metadata")}
              </sl-menu-item>
              <sl-divider></sl-divider>
            `,
          )}
          ${when(
            isSuccess,
            () => html`
              ${when(
                isCrawlType,
                () => html`
                  <btrix-menu-item-link href=${this.reviewUrl}>
                    <sl-icon slot="prefix" name="clipboard2-data"></sl-icon>
                    ${msg("Review Crawl")}
                  </btrix-menu-item-link>
                `,
              )}
              <btrix-menu-item-link
                href=${`/api/orgs/${this.orgId}/all-crawls/${this.itemId}/download?auth_bearer=${authToken}&preferSingleWACZ=true`}
                download
              >
                <sl-icon name="cloud-download" slot="prefix"></sl-icon>
                ${msg("Download Item")}
                ${this.item?.fileSize
                  ? html` <btrix-badge slot="suffix"
                      >${this.localize.bytes(this.item.fileSize)}</btrix-badge
                    >`
                  : nothing}
              </btrix-menu-item-link>
              <sl-divider></sl-divider>
            `,
          )}
          ${when(
            isCrawlType,
            () => html`
              <sl-menu-item
                @click=${() =>
                  this.navigate.to(
                    `${this.navigate.orgBasePath}/workflows/${this.item?.cid}`,
                  )}
              >
                <sl-icon name="arrow-return-right" slot="prefix"></sl-icon>
                ${msg("Go to Workflow")}
              </sl-menu-item>
              <sl-menu-item
                @click=${() =>
                  ClipboardController.copyToClipboard(this.item?.cid || "")}
              >
                <sl-icon name="copy" slot="prefix"></sl-icon>
                ${msg("Copy Workflow ID")}
              </sl-menu-item>
            `,
          )}
          <sl-menu-item
            @click=${() =>
              ClipboardController.copyToClipboard(
                this.item?.id ?? this.itemId ?? "",
              )}
          >
            <sl-icon name="copy" slot="prefix"></sl-icon>
            ${msg("Copy ID")}
          </sl-menu-item>
          <sl-menu-item
            @click=${() =>
              ClipboardController.copyToClipboard(this.item!.tags.join(", "))}
            ?disabled=${!this.item.tags.length}
          >
            <sl-icon name="tags" slot="prefix"></sl-icon>
            ${msg("Copy Tags")}
          </sl-menu-item>
          ${when(
            this.isCrawler,
            () => html`
              <sl-divider></sl-divider>
              <sl-menu-item
                class="menu-item-danger"
                @click=${() => {
                  if (isSuccess) {
                    this.openDialogName = "delete";
                  } else {
                    void this.deleteCrawl();
                  }
                }}
              >
                <sl-icon name="trash3" slot="prefix"></sl-icon>
                ${isWorkflowCrawl
                  ? msg("Delete Crawl")
                  : isSuccess
                    ? msg("Delete Archived Item")
                    : msg("Delete Item")}
              </sl-menu-item>
            `,
          )}
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private renderTitle(title: string | TemplateResult) {
    return html`<h2
      class="flex items-center gap-2 text-lg font-medium leading-8"
    >
      ${title}
    </h2>`;
  }

  private renderPanel(
    heading: string | TemplateResult,
    content: TemplateResult | undefined,
    classes: ClassValue[] = [],
  ) {
    const headingIsTitle = typeof heading === "string";
    return html`
      <header
        class="flex-0 mb-2 flex min-h-fit flex-wrap items-center justify-between gap-2 leading-none"
      >
        ${headingIsTitle ? this.renderTitle(heading) : heading}
      </header>
      <div class=${clsx("flex-1", ...classes)}>${content}</div>
    `;
  }

  private renderReplay() {
    const dedupeCollId =
      this.item &&
      isCrawl(this.item) &&
      this.item.requiresCrawls.length &&
      this.item.dedupeCollId;

    return html`
      ${dedupeCollId
        ? dedupeReplayNotice({
            dependenciesHref: this.dependenciesUrl,
            collectionHref: `${this.navigate.orgBasePath}/${OrgTab.Collections}/${CommonTab.View}/${dedupeCollId}`,
          })
        : nothing}
      <div class="overflow-hidden rounded-lg border">${this.renderRWP()}</div>
    `;
  }

  private renderRWP() {
    if (!this.item) return;
    const replaySource = `/api/orgs/${this.item.oid}/${
      this.item.type === "upload" ? "uploads" : "crawls"
    }/${this.itemId}/replay.json`;

    const headers = this.authState?.headers;

    const config = JSON.stringify({ headers });

    const canReplay = this.hasFiles;

    return html`
      <!-- https://github.com/webrecorder/browsertrix-crawler/blob/9f541ab011e8e4bccf8de5bd7dc59b632c694bab/screencast/index.html -->
      ${
        canReplay
          ? html`<div id="replay-crawl" class="aspect-4/3 overflow-hidden">
              <replay-web-page
                source="${replaySource}"
                url="${(this.item.seedCount === 1 && this.item.firstSeed) ||
                ""}"
                coll="${ifDefined(this.item.id)}"
                config="${config}"
                replayBase="/replay/"
                noSandbox="true"
                noCache="true"
              ></replay-web-page>
            </div>`
          : html`
              <p class="p-4 text-sm text-neutral-400">
                ${msg("No files to replay.")}
              </p>
            `
      }
      </div>
    `;
  }

  private renderOverview() {
    return html`
      <btrix-desc-list>
        <btrix-desc-list-item label=${msg("Status")}>
          ${this.item
            ? isCrawl(this.item)
              ? html`
                  <btrix-crawl-status
                    state=${this.item.state}
                  ></btrix-crawl-status>
                `
              : html`
                  <btrix-upload-status
                    state=${this.item.state}
                  ></btrix-upload-status>
                `
            : html`<sl-skeleton class="mb-[3px] h-[16px] w-24"></sl-skeleton>`}
        </btrix-desc-list-item>
        ${when(this.item, (item) =>
          item.type === "upload"
            ? html`
                <btrix-desc-list-item label=${msg("Uploaded")}>
                  ${this.formattedFinishedDate}
                </btrix-desc-list-item>
              `
            : html`
                <btrix-desc-list-item label=${msg("Date Started")}>
                  <btrix-format-date
                    date=${item.started}
                    dateStyle="long"
                    timeStyle="long"
                  ></btrix-format-date>
                </btrix-desc-list-item>
                <btrix-desc-list-item label=${msg("Date Finished")}>
                  ${item.finished
                    ? html`<btrix-format-date
                        date=${item.finished}
                        dateStyle="long"
                        timeStyle="long"
                      ></btrix-format-date>`
                    : html`<span class="text-0-400">${msg("Pending")}</span>`}
                </btrix-desc-list-item>
                <btrix-desc-list-item label=${msg("Run Duration")}>
                  ${item.finished
                    ? html`${this.localize.humanizeDuration(
                        new Date(item.finished).valueOf() -
                          new Date(item.started).valueOf(),
                      )}`
                    : html`
                        <span class="text-violet-600">
                          <btrix-relative-duration
                            value=${item.started}
                            unitCount="3"
                            tickSeconds="1"
                          ></btrix-relative-duration>
                        </span>
                      `}
                </btrix-desc-list-item>
                <btrix-desc-list-item label=${msg("Execution Time")}>
                  ${item.finished
                    ? html`<span
                        >${humanizeExecutionSeconds(item.crawlExecSeconds, {
                          displaySeconds: true,
                        })}</span
                      >`
                    : html`<span class="text-0-400">${msg("Pending")}</span>`}
                </btrix-desc-list-item>
                <btrix-desc-list-item label=${msg("Initiator")}>
                  ${item.manual
                    ? msg(
                        html`Manual start by
                          <span>${item.userName || item.userid}</span>`,
                      )
                    : msg(html`Scheduled start`)}
                </btrix-desc-list-item>
              `,
        )}
        <btrix-desc-list-item label=${msg("Pages")}>
          ${this.item
            ? html`${this.localize.number(this.item.pageCount || 0)}
              ${pluralOf("pages", this.item.pageCount || 0)}`
            : html`<sl-skeleton class="h-[16px] w-24"></sl-skeleton>`}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Size")}>
          ${this.item
            ? this.localize.bytes(this.item.fileSize || 0)
            : html`<sl-skeleton class="h-[16px] w-24"></sl-skeleton>`}
        </btrix-desc-list-item>
        ${this.renderCrawlChannelVersion()}
        <btrix-desc-list-item label=${msg("ID")}>
          ${this.item
            ? html`<btrix-copy-field
                value="${this.item.id}"
              ></btrix-copy-field>`
            : html`<sl-skeleton class="mb-[3px] h-[16px] w-24"></sl-skeleton>`}
        </btrix-desc-list-item>
      </btrix-desc-list>
    `;
  }

  private renderCrawlChannelVersion() {
    if (!this.item) {
      return html``;
    }

    const text =
      (this.item.crawlerChannel
        ? capitalize(this.item.crawlerChannel)
        : msg("Default")) + (this.item.image ? ` (${this.item.image})` : "");

    return html` <btrix-desc-list-item
      label=${msg("Crawler Channel (Exact Crawler Version)")}
    >
      <div class="flex items-center gap-2">
        <code class="grow" title=${text}>${text}</code>
      </div>
    </btrix-desc-list-item>`;
  }

  private renderMetadata() {
    const noneText = html`<span class="text-neutral-300">${msg("None")}</span>`;
    return html`
      <btrix-desc-list>
        <btrix-desc-list-item label=${msg("Description")}>
          ${when(
            this.item,
            () =>
              when(
                this.item!.description?.length,
                () =>
                  html`<pre class="whitespace-pre-line font-sans">
                      ${richText(this.item?.description ?? "")}
                </pre
                  >`,
                () => noneText,
              ),
            () => html`<sl-skeleton class="h-[16px] w-24"></sl-skeleton>`,
          )}
        </btrix-desc-list-item>
        <btrix-desc-list-item label=${msg("Tags")}>
          ${when(
            this.item,
            () =>
              when(
                this.item!.tags.length,
                () =>
                  this.item!.tags.map(
                    (tag) =>
                      html`<btrix-tag class="mr-2 mt-1">${tag}</btrix-tag>`,
                  ),
                () => noneText,
              ),
            () => html`<sl-skeleton class="h-[16px] w-24"></sl-skeleton>`,
          )}
        </btrix-desc-list-item>
      </btrix-desc-list>
    `;
  }

  private renderCollections() {
    const dedupeId = this.item && isCrawl(this.item) && this.item.dedupeCollId;

    return html`
      ${when(
        this.item,
        (item) =>
          when(
            item.collections.length,
            () => html`
              <btrix-linked-collections-list
                class="mt-1 block"
                .collections=${item.collections}
                dedupeId=${ifDefined(dedupeId || undefined)}
                baseUrl="${this.navigate.orgBasePath}/collections/view"
              ></btrix-linked-collections-list>
            `,
            () =>
              panelBody({
                content: html`<p class="text-xs text-neutral-500">
                  ${msg("This item is not included in any collections.")}
                </p>`,
              }),
          ),
        () => html`<sl-skeleton class="h-[16px] w-24"></sl-skeleton>`,
      )}
    `;
  }

  private renderDependencies() {
    if (!this.item) return;

    if (!isCrawlReplay(this.item)) {
      return panelBody({
        content: emptyMessage({
          message: msg("Crawl dependencies are not applicable for this item."),
        }),
      });
    }

    const noDeps = panelBody({
      content: emptyMessage({
        message: msg("This crawl doesn't have any dependencies."),
      }),
    });

    if (!this.item.requiresCrawls.length) {
      return noDeps;
    }

    return html`
      ${this.dependenciesTask.render({
        complete: (deps) =>
          deps
            ? html`<div
                  class="mb-3 flex items-center justify-between gap-3 rounded-lg border bg-neutral-50 p-3"
                >
                  <div class="text-neutral-500">
                    ${this.localize.number(deps.total)}
                    ${pluralOf("dependencies", deps.total)}
                  </div>
                </div>
                <btrix-item-dependency-tree .items=${deps.items} showHeader>
                </btrix-item-dependency-tree>`
            : noDeps,
      })}
    `;
  }

  private renderFiles() {
    const dedupeCollId =
      this.item &&
      isCrawl(this.item) &&
      this.item.requiresCrawls.length &&
      this.item.dedupeCollId;

    return html`
      ${this.hasFiles && dedupeCollId
        ? dedupeFilesNotice({
            dependenciesHref: this.dependenciesUrl,
            collectionHref: `${this.navigate.orgBasePath}/${OrgTab.Collections}/${CommonTab.View}/${dedupeCollId}`,
          })
        : nothing}
      ${this.hasFiles
        ? html`
            <ul class="rounded-lg border text-sm">
              ${this.item!.resources!.map(
                (file) => html`
                  <li
                    class="flex justify-between border-t p-3 first:border-t-0"
                  >
                    <div class="flex items-center truncate whitespace-nowrap">
                      <sl-icon
                        name="file-earmark-zip-fill"
                        class="h-4 shrink-0 pr-2 text-neutral-600"
                      ></sl-icon>
                      <a
                        class="mr-2 truncate text-blue-600 hover:text-blue-500 hover:underline"
                        href=${file.path}
                        download
                        title=${file.name}
                        >${file.name.slice(file.name.lastIndexOf("/") + 1)}
                      </a>
                    </div>
                    <div
                      class="whitespace-nowrap font-mono text-sm text-neutral-400"
                    >
                      ${when(
                        file.numReplicas > 0,
                        () =>
                          html` <sl-tooltip content=${msg("Backed up")}>
                            <sl-icon
                              name="clouds-fill"
                              class="mr-2 size-4 shrink-0 align-text-bottom text-success"
                            ></sl-icon>
                          </sl-tooltip>`,
                      )}
                      ${this.localize.bytes(Number(file.size))}
                    </div>
                  </li>
                `,
              )}
            </ul>
          `
        : html`
            <p class="text-sm text-neutral-400">
              ${msg("No files to download.")}
            </p>
          `}
    `;
  }

  private renderLogs() {
    if (!this.itemId) return;

    return html` <btrix-crawl-logs crawlId=${this.itemId}></btrix-crawl-logs> `;
  }

  private renderConfig() {
    return html`
      <div
        aria-live="polite"
        aria-busy=${!this.item ||
        !this.seeds ||
        this.seedFileTask.status === TaskStatus.PENDING}
      >
        ${when(
          this.item &&
            this.seeds &&
            this.workflow &&
            this.seedFileTask.status !== TaskStatus.PENDING,
          () => html`
            <btrix-config-details
              .crawlConfig=${{
                ...this.item,
              } as CrawlConfig}
              .seeds=${this.seeds!.items}
              .seedFile=${this.seedFileTask.value || undefined}
              hideMetadata
            ></btrix-config-details>
          `,
          this.renderLoading,
        )}
      </div>
    `;
  }

  private readonly renderQAHeader = (qaRuns: QARun[]) => {
    const analyzing = this.isRunActive;

    return html`
      ${analyzing
        ? html`
            <sl-button-group>
              <sl-button
                size="small"
                @click=${() => void this.stopQARunDialog?.show()}
              >
                <sl-icon name="dash-square" slot="prefix"></sl-icon>
                <span>${msg("Stop Analysis")}</span>
              </sl-button>
              <sl-button
                size="small"
                @click=${() => void this.cancelQARunDialog?.show()}
              >
                <sl-icon
                  name="x-octagon"
                  slot="prefix"
                  class="text-danger"
                ></sl-icon>
                <span class="text-danger">${msg("Cancel Analysis")}</span>
              </sl-button>
            </sl-button-group>
          `
        : html`
            <sl-button
              size="small"
              variant="${
                // This is checked again being 0 explicitly because while QA state is loading, `this.qaRuns` is undefined, and the content change is less when the rightmost button stays non-primary when a run exists.
                qaRuns.length === 0 ? "primary" : "default"
              }"
              @click=${() => void this.startQARun()}
              ?disabled=${isArchivingDisabled(this.org, true) || analyzing}
            >
              <sl-icon slot="prefix" name="microscope" library="app"></sl-icon>
              ${qaRuns.length ? msg("Rerun Analysis") : msg("Run Analysis")}
            </sl-button>
          `}

      <sl-button
        size="small"
        variant=${qaRuns.length === 0 ? "default" : "primary"}
        href=${this.reviewUrl}
        @click=${this.navigate.link}
      >
        <sl-icon slot="prefix" name="clipboard2-data"></sl-icon>
        ${msg("Review Crawl")}
      </sl-button>

      <btrix-dialog id="stopQARunDialog" .label=${msg("Stop QA Analysis?")}>
        ${msg(
          "Pages analyzed so far will be saved and this run will be marked as incomplete. Are you sure you want to stop this analysis run?",
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button
            size="small"
            variant="primary"
            .autofocus=${true}
            @click=${() => void this.stopQARunDialog?.hide()}
          >
            ${msg("Keep Running")}
          </sl-button>
          <sl-button
            size="small"
            variant="danger"
            outline
            @click=${async () => {
              await this.stopQARun();
              void this.stopQARunDialog?.hide();
            }}
            >${msg("Stop Analysis")}</sl-button
          >
        </div>
      </btrix-dialog>
      <btrix-dialog id="cancelQARunDialog" .label=${msg("Cancel QA Analysis?")}>
        ${msg(
          "Canceling will discard all analysis data associated with this run. Are you sure you want to cancel this analysis run?",
        )}
        <div slot="footer" class="flex justify-between">
          <sl-button
            size="small"
            variant="primary"
            .autofocus=${true}
            @click=${async () => this.cancelQARunDialog?.hide()}
          >
            ${msg("Keep Running")}
          </sl-button>
          <sl-button
            size="small"
            variant="danger"
            outline
            @click=${async () => {
              await this.cancelQARun();
              void this.cancelQARunDialog?.hide();
            }}
            >${msg("Cancel Analysis")}</sl-button
          >
        </div>
      </btrix-dialog>
    `;
  };

  private readonly renderLoading = () =>
    html`<div class="my-24 flex w-full items-center justify-center text-3xl">
      <sl-spinner></sl-spinner>
    </div>`;

  /**
   * Fetch crawl and update internal state
   */
  private async fetchCrawl(): Promise<void> {
    try {
      this.item = await this.getCrawl();
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve crawl at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "archived-item-retrieve-error",
      });
    }
  }

  private async fetchSeeds(): Promise<void> {
    try {
      this.seeds = await this.getSeeds();
    } catch {
      this.notify.toast({
        message: msg(
          "Sorry, couldn't retrieve all crawl settings at this time.",
        ),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "archived-item-retrieve-error",
      });
    }
  }

  private async fetchWorkflow(): Promise<void> {
    try {
      const id = this.workflowId || this.item?.cid;
      if (!id) {
        console.debug("no workflow id");
        return;
      }
      this.workflow = await this.getWorkflow(id);
    } catch (e: unknown) {
      this.notify.toast({
        message: msg("Sorry, couldn't load all crawl settings."),
        variant: "warning",
        icon: "exclamation-circle",
        id: "archived-item-retrieve-error",
      });
    }
  }

  private async getCrawl() {
    const apiPath = `/orgs/${this.orgId}/${
      this.itemType === "upload" ? "uploads" : "crawls"
    }/${this.itemId}/replay.json`;
    return this.api.fetch<CrawlReplay>(apiPath);
  }

  private async getSeeds() {
    // NOTE Returns first 1000 seeds (backend pagination max)
    const data = await this.api.fetch<APIPaginatedList<Seed>>(
      `/orgs/${this.orgId}/crawls/${this.itemId}/seeds`,
    );
    return data;
  }

  private async getWorkflow(id: string): Promise<Workflow> {
    return this.api.fetch<Workflow>(`/orgs/${this.orgId}/crawlconfigs/${id}`);
  }

  private async cancel() {
    if (window.confirm(msg("Are you sure you want to cancel the crawl?"))) {
      const data = await this.api.fetch<{ success: boolean }>(
        `/orgs/${this.item!.oid}/crawls/${this.itemId}/cancel`,
        {
          method: "POST",
        },
      );

      if (data.success) {
        void this.fetchCrawl();
      } else {
        this.notify.toast({
          message: msg("Sorry, couldn't cancel crawl at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
          id: "crawl-stop-error",
        });
      }
    }
  }

  private async stop() {
    if (window.confirm(msg("Are you sure you want to stop the crawl?"))) {
      const data = await this.api.fetch<{ success: boolean }>(
        `/orgs/${this.item!.oid}/crawls/${this.itemId}/stop`,
        {
          method: "POST",
        },
      );

      if (data.success) {
        void this.fetchCrawl();
      } else {
        this.notify.toast({
          message: msg("Sorry, couldn't stop crawl at this time."),
          variant: "danger",
          icon: "exclamation-octagon",
          id: "crawl-stop-error",
        });
      }
    }
  }

  private openMetadataEditor(section?: "metadata" | "collections") {
    if (section) {
      this.editDialog?.addEventListener(
        "sl-after-show",
        () => {
          switch (section) {
            case "metadata":
              this.editDialog?.descriptionInput?.focus();
              break;
            case "collections":
              this.editDialog?.collectionInput?.focus();
              break;
            default:
              break;
          }
        },
        { once: true },
      );
    }

    this.openDialogName = "metadata";
  }

  async checkFormValidity(formEl: HTMLFormElement) {
    await this.updateComplete;
    return !formEl.querySelector("[data-invalid]");
  }

  private async deleteCrawl() {
    try {
      const _data = await this.api.fetch(
        `/orgs/${this.item!.oid}/${
          this.item!.type === "crawl" ? "crawls" : "uploads"
        }/delete`,
        {
          method: "POST",
          body: JSON.stringify({
            crawl_ids: [this.item!.id],
          }),
        },
      );
      this.navigate.to(this.listUrl);
      this.notify.toast({
        message: msg(`Successfully deleted crawl`),
        variant: "success",
        icon: "check2-circle",
        id: "crawl-stop-error",
      });
    } catch (e) {
      let message = msg(
        str`Sorry, couldn't delete archived item at this time.`,
      );
      if (isApiError(e)) {
        if (e.details == "not_allowed") {
          message = msg(
            str`Only org owners can delete other users' archived items.`,
          );
        } else if (e.message) {
          message = e.message;
        }
      }
      this.notify.toast({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
        id: "archived-item-delete-status",
      });
    }
  }

  private async startQARun() {
    try {
      const result = await this.api.fetch<{ started: string }>(
        `/orgs/${this.orgId}/crawls/${this.itemId}/qa/start`,
        {
          method: "POST",
        },
      );
      this.qaRunId = result.started;

      void this.fetchQARuns();

      this.notify.toast({
        message: msg("Starting QA analysis..."),
        variant: "success",
        icon: "check2-circle",
        id: "qa-start-status",
      });
    } catch (e: unknown) {
      let message = msg("Sorry, couldn't start QA run at this time.");
      if (e instanceof Error && e.message === "qa_not_supported_for_crawl") {
        message = msg(
          "Sorry, QA analysis is not supported for this crawl as it was run with an older crawler version. Please run a new crawl with the latest crawler and QA should be available.",
        );
      }
      console.debug(e);

      this.notify.toast({
        message,
        variant: "danger",
        icon: "exclamation-octagon",
        id: "qa-start-status",
      });
    }
  }

  private async stopQARun() {
    try {
      const data = await this.api.fetch<{ success: boolean }>(
        `/orgs/${this.item!.oid}/crawls/${this.itemId}/qa/stop`,
        {
          method: "POST",
        },
      );

      if (!data.success) {
        throw data;
      }

      void this.fetchQARuns();
      this.notify.toast({
        message: msg(`Stopping QA analysis...`),
        variant: "success",
        icon: "check2-circle",
        id: "qa-stop-status",
      });
    } catch (e: unknown) {
      this.notify.toast({
        message:
          e === "qa_not_running"
            ? msg("Analysis is not currently running.")
            : msg("Sorry, couldn't stop crawl at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "qa-stop-status",
      });
    }
  }

  private async cancelQARun() {
    try {
      const data = await this.api.fetch<{ success: boolean }>(
        `/orgs/${this.item!.oid}/crawls/${this.itemId}/qa/cancel`,
        {
          method: "POST",
        },
      );

      if (!data.success) {
        throw data;
      }

      void this.fetchQARuns();
      this.notify.toast({
        message: msg(`Canceling QA analysis...`),
        variant: "success",
        icon: "check2-circle",
        id: "qa-stop-status",
      });
    } catch (e: unknown) {
      this.notify.toast({
        message:
          e === "qa_not_running"
            ? msg("Analysis is not currently running.")
            : msg("Sorry, couldn't cancel crawl at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "qa-stop-status",
      });
    }
  }

  private async fetchQARuns(): Promise<void> {
    try {
      this.qaRuns = await this.getQARuns();
    } catch {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve QA analysis runs at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "archived-item-retrieve-error",
      });
    }

    this.isRunActive = Boolean(this.qaRuns?.[0] && isActive(this.qaRuns[0]));

    if (this.isRunActive) {
      // Clear current timer, if it exists
      if (this.timerId != null) {
        this.stopPoll();
      }
      // Restart timer for next poll
      this.timerId = window.setTimeout(() => {
        void this.fetchQARuns();
      }, 1000 * POLL_INTERVAL_SECONDS);
    }
  }

  private async getSeedFile(seedFileId: string, signal: AbortSignal) {
    const data = await this.api.fetch<StorageSeedFile>(
      `/orgs/${this.orgId}/files/${seedFileId}`,
      { signal },
    );
    return data;
  }

  private stopPoll() {
    window.clearTimeout(this.timerId);
  }

  private async getQARuns(): Promise<QARun[]> {
    return this.api.fetch<QARun[]>(
      `/orgs/${this.orgId}/crawls/${this.itemId}/qa`,
    );
  }
}
