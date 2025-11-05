import { localized, msg, str } from "@lit/localize";
import { Task } from "@lit/task";
import { html, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import capitalize from "lodash/fp/capitalize";
import queryString from "query-string";

import { BtrixElement } from "@/classes/BtrixElement";
import { ClipboardController } from "@/controllers/clipboard";
import { none } from "@/layouts/empty";
import { emptyMessage } from "@/layouts/emptyMessage";
import { page } from "@/layouts/page";
import { panel, panelBody } from "@/layouts/panel";
import { secondaryPanel } from "@/layouts/secondaryPanel";
import { OrgTab } from "@/routes";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { Profile, Workflow } from "@/types/crawler";
import { SortDirection } from "@/types/utils";
import { renderName } from "@/utils/crawler";
import { isArchivingDisabled } from "@/utils/orgs";
import { pluralOf } from "@/utils/pluralize";

@customElement("btrix-browser-profiles-profile-page")
@localized()
export class BrowserProfilesProfilePage extends BtrixElement {
  @property({ type: String })
  profileId = "";

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
    task: async ([profileId], { signal }) => {
      return this.getWorkflows({ profileId, page: 1, pageSize: 10 }, signal);
    },
    args: () => [this.profileId] as const,
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
      <sl-button size="small">
        <sl-icon slot="prefix" name="window-fullscreen"></sl-icon>
        ${msg("Open Profile")}
      </sl-button>
      <sl-dropdown distance="4" placement="bottom-end">
        <sl-button size="small" slot="trigger" caret>
          ${msg("Actions")}
        </sl-button>
        <sl-menu>
          <sl-menu-item @click=${() => {}}>
            <sl-icon slot="prefix" name="window-fullscreen"></sl-icon>
            ${msg("Open Profile")}
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
      <div class="grid grid-cols-5 gap-7">
        <div
          class="col-span-full flex flex-col gap-7 lg:col-span-3 lg:mt-2 lg:gap-5"
        >
          ${this.renderConfig()} ${this.renderDescription()}
        </div>

        <div
          class="col-span-full flex flex-col flex-wrap gap-7 lg:col-span-2 lg:mt-4"
        >
          ${this.renderInfo()} ${this.renderUsage()}
        </div>
      </div>
    `;
  };

  private renderConfig() {
    const siteListSkeleton = () =>
      html`<sl-skeleton effect="sheen" class="h-7"></sl-skeleton>`;
    const content = html`<div>
        <btrix-desc-list>
          <btrix-desc-list-item label=${msg("Crawler Release Channel")}>
            ${this.renderDetail((profile) =>
              profile.crawlerChannel
                ? capitalize(profile.crawlerChannel)
                : none,
            )}
          </btrix-desc-list-item>
          <btrix-desc-list-item label=${msg("Proxy")}>
            ${this.renderDetail((profile) =>
              profile.proxyId ? profile.proxyId : none,
            )}
          </btrix-desc-list-item>
        </btrix-desc-list>
      </div>

      <section class="mt-5">
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
                      content=${msg("View in Profile")}
                    >
                      <button
                        class="flex flex-1 items-center gap-2 truncate p-2 text-neutral-700 hover:text-cyan-700"
                      >
                        <div>
                          <sl-icon
                            name="arrow-return-right"
                            label=${msg("Enter Profile")}
                          ></sl-icon>
                        </div>
                        <div class="font-monostyle flex-1 truncate text-left">
                          ${origin}
                        </div>
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
      </section> `;

    return panel({
      heading: msg("Profile Configuration"),
      actions: this.appState.isCrawler
        ? html`<sl-tooltip content=${msg("Configure Profile")}>
            <sl-icon-button class="text-base" name="gear"></sl-icon-button>
          </sl-tooltip>`
        : undefined,
      body: panelBody({ content }),
    });
  }

  private renderDescription() {
    const skeleton = () =>
      html`<sl-skeleton class="mb-2 h-4 w-11/12"></sl-skeleton>
        <sl-skeleton class="mb-2 h-4"></sl-skeleton>
        <sl-skeleton class="mb-2 h-4 w-1/3"></sl-skeleton>`;

    const content = html`<div class="mx-auto min-h-36 max-w-prose">
      ${this.profileTask.render({
        initial: skeleton,
        pending: skeleton,
        complete: (profile) =>
          profile.description
            ? html`
                <div class="text-pretty leading-relaxed text-neutral-700">
                  ${profile.description}
                </div>
              `
            : emptyMessage({
                message: msg("No description added."),
                actions: this.appState.isCrawler
                  ? html`<sl-button size="small">
                      <sl-icon slot="prefix" name="pencil"></sl-icon>
                      ${msg("Add Description")}</sl-button
                    >`
                  : undefined,
              }),
      })}
    </div>`;

    return panel({
      heading: msg("Description"),
      actions: this.appState.isCrawler
        ? html`<sl-tooltip content=${msg("Edit")}>
            <sl-icon-button class="text-base" name="pencil"></sl-icon-button>
          </sl-tooltip>`
        : undefined,
      body: panelBody({ content }),
    });
  }

  private renderInfo() {
    return secondaryPanel({
      heading: msg("General Information"),
      body: html` <btrix-table class="grid-cols-2">
        <btrix-table-body class="[--btrix-row-gap:var(--sl-spacing-small)]">
          <btrix-table-row>
            <btrix-table-header-cell
              scope="row"
              class="text-xs text-neutral-500"
            >
              ${msg("Size")}
            </btrix-table-header-cell>
            <btrix-table-cell class="font-monostyle">
              ${this.renderDetail((profile) =>
                this.localize.bytes(profile.resource?.size || 0),
              )}
            </btrix-table-cell>
          </btrix-table-row>
          <btrix-table-row>
            <btrix-table-header-cell
              scope="row"
              class="text-xs text-neutral-500"
            >
              ${msg("Last Modified")}
            </btrix-table-header-cell>
            <btrix-table-cell class="font-monostyle">
              ${this.renderDetail((profile) =>
                this.localize.relativeDate(
                  // NOTE older profiles may not have "modified" data
                  profile.modified || profile.created,
                ),
              )}
            </btrix-table-cell>
          </btrix-table-row>
          <btrix-table-row>
            <btrix-table-header-cell
              scope="row"
              class="text-xs text-neutral-500"
            >
              ${msg("Modified By")}
            </btrix-table-header-cell>
            <btrix-table-cell class="font-monostyle">
              ${this.renderDetail(
                (profile) =>
                  profile.modifiedByName || profile.createdByName || none,
              )}
            </btrix-table-cell>
          </btrix-table-row>
          ${when(this.profile, (profile) =>
            profile.created && profile.created !== profile.modified
              ? html`
                  <btrix-table-row>
                    <btrix-table-header-cell
                      scope="row"
                      class="text-xs text-neutral-500"
                    >
                      ${msg("Date Created")}
                    </btrix-table-header-cell>
                    <btrix-table-cell class="font-monostyle">
                      ${this.localize.date(profile.created, {
                        dateStyle: "medium",
                      })}
                    </btrix-table-cell>
                  </btrix-table-row>
                `
              : nothing,
          )}
        </btrix-table-body>
      </btrix-table>`,
    });
  }

  private renderUsage() {
    const workflowListSkeleton = () =>
      html`<sl-skeleton class="h-36" effect="sheen"></sl-skeleton>`;

    return secondaryPanel({
      heading: msg("Usage in Crawl Workflows"),
      body: this.profileTask.render({
        initial: workflowListSkeleton,
        pending: workflowListSkeleton,
        complete: (profile) =>
          profile.inUse
            ? this.workflowsTask.render({
                initial: workflowListSkeleton,
                pending: workflowListSkeleton,
                complete: this.renderWorkflows,
              })
            : html`${emptyMessage({
                message: msg("Not used by any crawl workflows."),
                actions: html`<sl-button size="small">
                  <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                  ${msg("Create Workflow Using Profile")}</sl-button
                >`,
              })}`,
      }),
    });
  }

  private readonly renderWorkflows = (
    workflows: APIPaginatedList<Workflow>,
  ) => {
    const number_of_workflows = this.localize.number(workflows.total);
    const plural_of_workflows = pluralOf("workflows", workflows.total);

    return html`
      <div class="flex flex-wrap justify-between gap-2">
        <div class="text-neutral-500" id="workflow-list-heading">
          ${msg("Most Recently Crawled")}
        </div>
        <btrix-link
          href="${this.navigate.orgBasePath}/${OrgTab.Workflows}?profiles=${this
            .profileId}"
          target="_blank"
          variant="primary"
        >
          ${workflows.total > 1
            ? msg(str`View ${number_of_workflows} ${plural_of_workflows}`)
            : msg("View")}
        </btrix-link>
      </div>
      <ul
        class="divided my-3 rounded border"
        aria-labelledby="workflow-list-heading"
      >
        ${workflows.items.map(
          (workflow) =>
            html`<li class="flex items-center justify-between">
              <div class="w-0 flex-grow p-2">${renderName(workflow)}</div>
              <div class="flex items-center gap-0.5">
                <sl-tooltip placement="right" content=${msg("Open in New Tab")}>
                  <sl-icon-button
                    name="arrow-up-right"
                    href="${this.navigate
                      .orgBasePath}/${OrgTab.Workflows}/${workflow.id}"
                    target="_blank"
                  ></sl-icon-button>
                </sl-tooltip>
              </div>
            </li>`,
        )}
      </ul>
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
