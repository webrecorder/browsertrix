import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import { html, type PropertyValues } from "lit";
import { customElement, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { Profile } from "./types";

import type { SelectNewDialogEvent } from ".";

import { BtrixElement } from "@/classes/BtrixElement";
import type {
  BtrixFilterChipChangeEvent,
  FilterChip,
} from "@/components/ui/filter-chip";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import type { BtrixChangeTagFilterEvent } from "@/components/ui/tag-filter/types";
import { ClipboardController } from "@/controllers/clipboard";
import { SearchParamsValue } from "@/controllers/searchParamsValue";
import { originsWithRemainder } from "@/features/browser-profiles/templates/origins-with-remainder";
import { emptyMessage } from "@/layouts/emptyMessage";
import { page } from "@/layouts/page";
import { OrgTab } from "@/routes";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import { SortDirection as SortDirectionEnum } from "@/types/utils";
import { isApiError } from "@/utils/api";
import { isArchivingDisabled } from "@/utils/orgs";

const SORT_DIRECTIONS = ["asc", "desc"] as const;
type SortDirection = (typeof SORT_DIRECTIONS)[number];
type SortField = "name" | "url" | "modified" | "created";
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
    label: msg("Primary Site"),
    defaultDirection: "asc",
  },
  modified: {
    label: msg("Modified By User"),
    defaultDirection: "desc",
  },
  created: {
    label: msg("Date Created"),
    defaultDirection: "desc",
  },
};

const DEFAULT_SORT_BY = {
  field: "modified",
  direction: sortableFields.modified.defaultDirection || "desc",
} as const satisfies SortBy;
const INITIAL_PAGE_SIZE = 20;
const FILTER_BY_CURRENT_USER_STORAGE_KEY = "btrix.filterByCurrentUser.crawls";

const columnsCss = [
  "min-content", // Status
  "[clickable-start] minmax(min-content, 1fr)", // Name
  "30ch", // Tags
  "40ch", // Origins
  "minmax(min-content, 20ch)", // Last modified
  "[clickable-end] min-content", // Actions
].join(" ");

@customElement("btrix-browser-profiles-list")
@localized()
export class BrowserProfilesList extends BtrixElement {
  @state()
  private selectedProfile?: Profile;

  @state()
  private openDialog?: "duplicate";

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

  private readonly filterByTags = new SearchParamsValue<string[] | undefined>(
    this,
    (value, params) => {
      params.delete("tags");
      value?.forEach((v) => {
        params.append("tags", v);
      });
      return params;
    },
    (params) => params.getAll("tags"),
  );

  private readonly filterByTagsType = new SearchParamsValue<"and" | "or">(
    this,
    (value, params) => {
      if (value === "and") {
        params.set("tagsType", value);
      } else {
        params.delete("tagsType");
      }
      return params;
    },
    (params) => (params.get("tagsType") === "and" ? "and" : "or"),
  );

  private readonly filterByCurrentUser = new SearchParamsValue<boolean>(
    this,
    (value, params) => {
      if (value) {
        params.set("mine", "true");
      } else {
        params.delete("mine");
      }
      return params;
    },
    (params) => params.get("mine") === "true",
    {
      initial: (initialValue) =>
        window.sessionStorage.getItem(FILTER_BY_CURRENT_USER_STORAGE_KEY) ===
          "true" ||
        initialValue ||
        false,
    },
  );

  private get hasFiltersSet() {
    return [
      this.filterByCurrentUser.value || undefined,
      this.filterByTags.value?.length || undefined,
    ].some((v) => v !== undefined);
  }

  get isCrawler() {
    return this.appState.isCrawler;
  }

  private clearFilters() {
    this.filterByCurrentUser.setValue(false);
    this.filterByTags.setValue([]);
  }

  private readonly profilesTask = new Task(this, {
    task: async (
      [
        pagination,
        orderBy,
        filterByCurrentUser,
        filterByTags,
        filterByTagsType,
      ],
      { signal },
    ) => {
      return this.getProfiles(
        {
          ...pagination,
          userid: filterByCurrentUser ? this.userInfo?.id : undefined,
          tags: filterByTags,
          tagMatch: filterByTagsType,
          sortBy: orderBy.field,
          sortDirection:
            orderBy.direction === "desc"
              ? SortDirectionEnum.Descending
              : SortDirectionEnum.Ascending,
        },
        signal,
      );
    },
    args: () =>
      [
        this.pagination,
        this.orderBy.value,
        this.filterByCurrentUser.value,
        this.filterByTags.value,
        this.filterByTagsType.value,
      ] as const,
  });

  protected willUpdate(changedProperties: PropertyValues): void {
    if (
      changedProperties.has("orderBy.internalValue") ||
      changedProperties.has("filterByCurrentUser.internalValue") ||
      changedProperties.has("filterByTags.internalValue") ||
      changedProperties.has("filterByTagsType.internalValue")
    ) {
      this.pagination = {
        ...this.pagination,
        page: 1,
      };
    }

    if (changedProperties.has("filterByCurrentUser.internalValue")) {
      window.sessionStorage.setItem(
        FILTER_BY_CURRENT_USER_STORAGE_KEY,
        this.filterByCurrentUser.value.toString(),
      );
    }
  }

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
      ${when(this.selectedProfile, this.renderDuplicateDialog)}
    `;
  };

  private readonly renderDuplicateDialog = (profile: Profile) => {
    return html`<btrix-profile-browser-dialog
      .profile=${profile}
      .config=${{
        url: profile.origins[0],
        name: `${profile.name} ${msg("Copy")}`,
        crawlerChannel: profile.crawlerChannel,
        proxyId: profile.proxyId,
      }}
      ?open=${this.openDialog === "duplicate"}
      duplicating
      @sl-after-hide=${() => {
        this.selectedProfile = undefined;
        this.openDialog = undefined;
      }}
    >
    </btrix-profile-browser-dialog>`;
  };

  private renderEmpty() {
    if (this.hasFiltersSet) {
      return emptyMessage({
        message: msg("No matching profiles found."),
        actions: html`<sl-button size="small" @click=${this.clearFilters}>
          <sl-icon slot="prefix" name="x-lg"></sl-icon>
          ${msg("Create filters")}
        </sl-button>`,
      });
    }

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
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <span class="whitespace-nowrap text-neutral-500">
            ${msg("Filter by:")}
          </span>
          ${this.renderFilterControls()}
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <label class="whitespace-nowrap text-neutral-500" for="sort-select">
            ${msg("Sort by:")}
          </label>
          ${this.renderSortControl()}
        </div>
      </div>
    `;
  }

  private renderFilterControls() {
    return html`
      <btrix-tag-filter
        tagType="profile"
        .tags=${this.filterByTags.value}
        .type=${this.filterByTagsType.value}
        @btrix-change=${(e: BtrixChangeTagFilterEvent) => {
          this.filterByTags.setValue(e.detail.value?.tags || []);
          this.filterByTagsType.setValue(e.detail.value?.type || "or");
        }}
      ></btrix-tag-filter>

      <btrix-filter-chip
        ?checked=${this.filterByCurrentUser.value}
        @btrix-change=${(e: BtrixFilterChipChangeEvent) => {
          const { checked } = e.target as FilterChip;
          this.filterByCurrentUser.setValue(Boolean(checked));
        }}
      >
        ${msg("Mine")}
      </btrix-filter-chip>

      ${when(
        this.hasFiltersSet,
        () => html`
          <sl-button
            class="[--sl-color-primary-600:var(--sl-color-neutral-500)] part-[label]:font-medium"
            size="small"
            variant="text"
            @click=${this.clearFilters}
          >
            <sl-icon slot="prefix" name="x-lg"></sl-icon>
            ${msg("Clear All")}
          </sl-button>
        `,
      )}
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
          <btrix-table-header-cell>${msg("Name")}</btrix-table-header-cell>
          <btrix-table-header-cell> ${msg("Tags")} </btrix-table-header-cell>
          <btrix-table-header-cell>
            ${msg("Saved Sites")}
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
    const modifiedByAnyDate =
      [data.modifiedCrawlDate, data.modified, data.created].reduce(
        (a, b) => (b && a && b > a ? b : a),
        data.created,
      ) || data.created;

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
          <btrix-tag-container class="relative hover:z-[2]" .tags=${data.tags}>
          </btrix-tag-container>
        </btrix-table-cell>
        <btrix-table-cell>
          ${originsWithRemainder(data.origins)}
        </btrix-table-cell>
        <btrix-table-cell>
          ${this.localize.relativeDate(modifiedByAnyDate, { capitalize: true })}
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
    this.selectedProfile = profile;
    await this.updateComplete;
    this.openDialog = "duplicate";
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

  private async getProfiles(
    params: {
      userid?: string;
      tags?: string[];
      tagMatch?: string;
    } & APIPaginationQuery &
      APISortQuery,
    signal: AbortSignal,
  ) {
    const query = queryString.stringify(
      {
        ...params,
      },
      {
        arrayFormat: "none", // For tags
      },
    );

    const data = await this.api.fetch<APIPaginatedList<Profile>>(
      `/orgs/${this.orgId}/profiles?${query}`,
      { signal },
    );

    return data;
  }
}
