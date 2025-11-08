import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { Profile } from "./types";

import type { SelectNewDialogEvent } from ".";

import { BtrixElement } from "@/classes/BtrixElement";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import { ClipboardController } from "@/controllers/clipboard";
import { SearchParamsValue } from "@/controllers/searchParamsValue";
import { emptyMessage } from "@/layouts/emptyMessage";
import { page } from "@/layouts/page";
import { OrgTab } from "@/routes";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import type { Browser } from "@/types/browser";
import { SortDirection } from "@/types/utils";
import { isApiError } from "@/utils/api";
import { isArchivingDisabled } from "@/utils/orgs";

const SORT_DIRECTIONS = ["asc", "desc"] as const;
type SortDirection = (typeof SORT_DIRECTIONS)[number];
type SortField = "name" | "url" | "modified";
type SortBy = {
  field: SortField;
  direction: SortDirection;
};

const sortableFields: Record<
  SortField,
  { label: string; defaultDirection?: SortDirection }
> = {
  name: {
    label: msg("Name"),
    defaultDirection: "desc",
  },
  url: {
    label: msg("Starting URL"),
    defaultDirection: "asc",
  },
  modified: {
    label: msg("Last Modified"),
    defaultDirection: "desc",
  },
};

const DEFAULT_SORT_BY = {
  field: "modified",
  direction: sortableFields.modified.defaultDirection || "desc",
} as const satisfies SortBy;
const INITIAL_PAGE_SIZE = 20;

const columnsCss = [
  "min-content", // Status
  "[clickable-start] minmax(min-content, 1fr)", // Name
  "minmax(max-content, 1fr)", // Visited sites
  "minmax(min-content, 22ch)", // Last modified
  "[clickable-end] min-content", // Actions
].join(" ");

@customElement("btrix-browser-profiles-list")
@localized()
export class BrowserProfilesList extends BtrixElement {
  @state()
  private pagination: Required<APIPaginationQuery> = {
    page: parsePage(new URLSearchParams(location.search).get("page")),
    pageSize: INITIAL_PAGE_SIZE,
  };

  private readonly orderBy = new SearchParamsValue<SortBy>(
    this,
    (value, params) => {
      if (value.field === DEFAULT_SORT_BY.field) {
        params.delete("sortBy");
      } else {
        params.set("sortBy", value.field);
      }
      if (value.direction === sortableFields[value.field].defaultDirection) {
        params.delete("sortDir");
      } else {
        params.set("sortDir", value.direction);
      }
      return params;
    },
    (params) => {
      const field = params.get("sortBy") as SortBy["field"] | null;
      if (!field) {
        return DEFAULT_SORT_BY;
      }
      let direction = params.get("sortDir");
      if (
        !direction ||
        (SORT_DIRECTIONS as readonly string[]).includes(direction)
      ) {
        direction =
          sortableFields[field].defaultDirection || DEFAULT_SORT_BY.direction;
      }
      return { field, direction: direction as SortDirection };
    },
  );

  get isCrawler() {
    return this.appState.isCrawler;
  }

  private readonly profilesTask = new Task(this, {
    task: async ([pagination, orderBy], { signal }) => {
      return this.getProfiles(
        {
          ...pagination,
          sortBy: orderBy.field,
          sortDirection:
            orderBy.direction === "desc"
              ? SortDirection.Descending
              : SortDirection.Ascending,
        },
        signal,
      );
    },
    args: () => [this.pagination, this.orderBy.value] as const,
  });

  render() {
    return page(
      {
        title: msg("Browser Profiles"),
        border: false,
        actions: this.isCrawler
          ? html`
              <sl-button
                variant="primary"
                size="small"
                ?disabled=${isArchivingDisabled(this.org)}
                @click=${() => {
                  this.dispatchEvent(
                    new CustomEvent("select-new-dialog", {
                      detail: "browser-profile",
                    }) as SelectNewDialogEvent,
                  );
                }}
              >
                <sl-icon slot="prefix" name="plus-lg"></sl-icon>
                ${msg("New Browser Profile")}
              </sl-button>
            `
          : undefined,
      },
      this.renderPage,
    );
  }

  private readonly renderPage = () => {
    return html`
      <div class="sticky top-2 z-10 mb-3 rounded-lg border bg-neutral-50 p-4">
        ${this.renderControls()}
      </div>

      ${when(
        this.profilesTask.value,
        ({ items, total, page, pageSize }) => html`
          ${total
            ? html`
                ${this.renderTable(items)}
                ${when(
                  total > pageSize,
                  () => html`
                    <footer class="mt-6 flex justify-center">
                      <btrix-pagination
                        page=${page}
                        totalCount=${total}
                        size=${pageSize}
                        @page-change=${async (e: PageChangeEvent) => {
                          this.pagination = {
                            ...this.pagination,
                            page: e.detail.page,
                          };
                          await this.updateComplete;

                          // Scroll to top of list
                          // TODO once deep-linking is implemented, scroll to top of pushstate
                          this.scrollIntoView({ behavior: "smooth" });
                        }}
                      ></btrix-pagination>
                    </footer>
                  `,
                )}
              `
            : this.renderEmpty()}
        `,
      )}
    `;
  };

  private renderEmpty() {
    const message = msg("Your org doesn’t have any browser profiles yet.");

    if (this.isCrawler) {
      return emptyMessage({
        message,
        detail: msg(
          "Browser profiles let you crawl pages behind paywalls and logins.",
        ),
        actions: html`
          <sl-button
            @click=${() => {
              this.dispatchEvent(
                new CustomEvent<SelectNewDialogEvent["detail"]>(
                  "select-new-dialog",
                  {
                    detail: "browser-profile",
                  },
                ),
              );
            }}
          >
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            ${msg("Create Browser Profile")}
          </sl-button>
        `,
      });
    }

    return emptyMessage({ message });
  }

  private renderControls() {
    return html`
      <div class="flex items-center">
        <label
          class="mr-2 whitespace-nowrap text-sm text-neutral-500"
          for="sort-select"
        >
          ${msg("Sort by:")}
        </label>
        ${this.renderSortControl()}
      </div>
    `;
  }

  private renderSortControl() {
    const options = Object.entries(sortableFields).map(
      ([value, { label }]) => html`
        <sl-option value=${value}>${label}</sl-option>
      `,
    );
    return html`
      <sl-select
        id="sort-select"
        class="md:min-w-[9.2rem]"
        size="small"
        pill
        value=${this.orderBy.value.field}
        @sl-change=${(e: Event) => {
          const field = (e.target as HTMLSelectElement).value as SortField;
          this.orderBy.setValue({
            field: field,
            direction:
              sortableFields[field].defaultDirection ||
              this.orderBy.value.direction,
          });
        }}
      >
        ${options}
      </sl-select>
      <sl-tooltip
        content=${this.orderBy.value.direction === "asc"
          ? msg("Sort in descending order")
          : msg("Sort in ascending order")}
      >
        <sl-icon-button
          name=${this.orderBy.value.direction === "asc"
            ? "sort-up-alt"
            : "sort-down"}
          class="text-base"
          label=${this.orderBy.value.direction === "asc"
            ? msg("Sort Descending")
            : msg("Sort Ascending")}
          @click=${() => {
            this.orderBy.setValue({
              ...this.orderBy.value,
              direction:
                this.orderBy.value.direction === "asc" ? "desc" : "asc",
            });
          }}
        ></sl-icon-button>
      </sl-tooltip>
    `;
  }

  private readonly renderTable = (profiles: Profile[]) => {
    return html`<btrix-overflow-scroll class="-mx-3 part-[content]:px-3">
      <btrix-table
        style="--btrix-table-grid-template-columns: ${columnsCss}"
        class="whitespace-nowrap [--btrix-table-cell-gap:var(--sl-spacing-x-small)] [--btrix-table-cell-padding-x:var(--sl-spacing-small)]"
      >
        <btrix-table-head class="mb-2">
          <btrix-table-header-cell class="pr-0">
            <span class="sr-only">${msg("Status")}</span>
          </btrix-table-header-cell>
          <btrix-table-header-cell> ${msg("Name")} </btrix-table-header-cell>
          <btrix-table-header-cell>
            ${msg("Visited Sites")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>
            ${msg("Last Modified")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>
            <span class="sr-only">${msg("Row actions")}</span>
          </btrix-table-header-cell>
        </btrix-table-head>
        <btrix-table-body
          class="divide-y rounded border [--btrix-table-cell-padding-y:var(--sl-spacing-2x-small)]"
        >
          ${profiles.map(this.renderItem)}
        </btrix-table-body>
      </btrix-table>
    </btrix-overflow-scroll>`;
  };

  private readonly renderItem = (data: Profile) => {
    const startingUrl = data.origins[0];
    const otherOrigins = data.origins.slice(1);

    return html`
      <btrix-table-row
        class="h-10 transition-colors duration-fast focus-within:bg-neutral-50 hover:bg-neutral-50"
      >
        <btrix-table-cell class="pr-0">
          <sl-tooltip content=${data.inUse ? msg("In Use") : msg("Not in Use")}>
            <sl-icon
              name=${data.inUse ? "check-circle" : "dash-circle"}
              class="${data.inUse
                ? "text-primary"
                : "text-neutral-400"} text-base"
            ></sl-icon>
          </sl-tooltip>
        </btrix-table-cell>
        <btrix-table-cell rowClickTarget="a">
          <a
            href="${this.navigate
              .orgBasePath}/${OrgTab.BrowserProfiles}/profile/${data.id}"
            @click=${this.navigate.link}
            class="truncate"
            >${data.name}</a
          >
        </btrix-table-cell>
        <btrix-table-cell>
          <btrix-code language="url" value=${startingUrl} noWrap></btrix-code>
          ${otherOrigins.length
            ? html`<btrix-popover placement="right" hoist>
                <btrix-badge
                  >+${this.localize.number(otherOrigins.length)}</btrix-badge
                >
                <ul slot="content">
                  ${otherOrigins.map((url) => html`<li>${url}</li>`)}
                </ul>
              </btrix-popover>`
            : nothing}
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.localize.relativeDate(data.modified || data.created)}
        </btrix-table-cell>
        <btrix-table-cell class="p-0">
          ${this.renderActions(data)}
        </btrix-table-cell>
      </btrix-table-row>
    `;
  };

  private renderActions(data: Profile) {
    return html`
      <btrix-overflow-dropdown @click=${(e: Event) => e.preventDefault()}>
        <sl-menu>
          <sl-menu-item
            ?disabled=${isArchivingDisabled(this.org)}
            @click=${() => {
              void this.duplicateProfile(data);
            }}
          >
            <sl-icon slot="prefix" name="files"></sl-icon>
            ${msg("Duplicate Profile")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          <sl-menu-item
            @click=${() => ClipboardController.copyToClipboard(data.id)}
          >
            <sl-icon name="copy" slot="prefix"></sl-icon>
            ${msg("Copy Profile ID")}
          </sl-menu-item>
          <sl-divider></sl-divider>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => {
              void this.deleteProfile(data);
            }}
          >
            <sl-icon slot="prefix" name="trash3"></sl-icon>
            ${msg("Delete Profile")}
          </sl-menu-item>
        </sl-menu>
      </btrix-overflow-dropdown>
    `;
  }

  private async duplicateProfile(profile: Profile) {
    const url = profile.origins[0];

    try {
      const data = await this.createBrowser({ url });

      this.notify.toast({
        message: msg("Starting up browser with selected profile..."),
        variant: "success",
        icon: "check2-circle",
      });

      this.navigate.to(
        `${this.navigate.orgBasePath}/browser-profiles/profile/browser/${
          data.browserid
        }?${queryString.stringify({
          url,
          name: profile.name,
          description: profile.description,
          profileId: profile.id,
          crawlerChannel: profile.crawlerChannel,
        })}`,
      );
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn't create browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async deleteProfile(profile: Profile) {
    try {
      await this.api.fetch<{ error?: boolean }>(
        `/orgs/${this.orgId}/profiles/${profile.id}`,
        {
          method: "DELETE",
        },
      );

      this.notify.toast({
        message: msg(html`Deleted <strong>${profile.name}</strong>.`),
        variant: "success",
        icon: "check2-circle",
        id: "browser-profile-deleted-status",
      });

      this.pagination = {
        ...this.pagination,
        page: 1,
      };
    } catch (e) {
      let message = msg(
        html`Sorry, couldn't delete browser profile at this time.`,
      );

      if (isApiError(e)) {
        if (e.message === "profile_in_use") {
          message = msg(
            html`Could not delete <strong>${profile.name}</strong>, currently in
              use. Please remove browser profile from all crawl workflows to
              continue.`,
          );
        }
      }
      this.notify.toast({
        message: message,
        variant: "danger",
        icon: "exclamation-octagon",
        id: "browser-profile-error",
      });
    }
  }

  private async createBrowser({ url }: { url: string }) {
    const params = {
      url,
    };

    return this.api.fetch<Browser>(`/orgs/${this.orgId}/profiles/browser`, {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  private async getProfiles(
    params: APIPaginationQuery & APISortQuery,
    signal: AbortSignal,
  ) {
    const query = queryString.stringify(
      {
        ...params,
      },
      {
        arrayFormat: "comma",
      },
    );

    const data = await this.api.fetch<APIPaginatedList<Profile>>(
      `/orgs/${this.orgId}/profiles?${query}`,
      { signal },
    );

    return data;
  }
}
