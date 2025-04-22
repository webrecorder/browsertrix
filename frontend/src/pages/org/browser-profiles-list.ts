import { localized, msg, str } from "@lit/localize";
import clsx from "clsx";
import { css, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { Profile } from "./types";

import type { SelectNewDialogEvent } from ".";

import { BtrixElement } from "@/classes/BtrixElement";
import { parsePage, type PageChangeEvent } from "@/components/ui/pagination";
import {
  SortDirection,
  type SortValues,
} from "@/components/ui/table/table-header-cell";
import { ClipboardController } from "@/controllers/clipboard";
import { pageHeader } from "@/layouts/pageHeader";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import type { Browser } from "@/types/browser";
import { html } from "@/utils/LiteElement";
import { isArchivingDisabled } from "@/utils/orgs";
import { tw } from "@/utils/tailwind";

const INITIAL_PAGE_SIZE = 20;

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-list
 * ></btrix-browser-profiles-list>
 * ```
 */
@customElement("btrix-browser-profiles-list")
@localized()
export class BrowserProfilesList extends BtrixElement {
  @property({ type: Boolean })
  isCrawler = false;

  @state()
  browserProfiles?: APIPaginatedList<Profile>;

  @state()
  sort: Required<APISortQuery> = {
    sortBy: "modified",
    sortDirection: -1,
  };

  @state()
  private isLoading = true;

  static styles = css`
    btrix-table {
      grid-template-columns:
        [clickable-start] minmax(30ch, 50ch) minmax(30ch, 40ch) repeat(2, 1fr)
        [clickable-end] min-content;
      --btrix-table-cell-gap: var(--sl-spacing-x-small);
      --btrix-table-cell-padding-x: var(--sl-spacing-small);
    }

    btrix-table-body btrix-table-row:nth-of-type(n + 2) {
      --btrix-border-top: 1px solid var(--sl-panel-border-color);
    }

    btrix-table-body btrix-table-row:first-of-type {
      --btrix-border-radius-top: var(--sl-border-radius-medium);
    }

    btrix-table-body btrix-table-row:last-of-type {
      --btrix-border-radius-bottom: var(--sl-border-radius-medium);
    }

    btrix-table-row {
      border-top: var(--btrix-border-top, 0);
      border-radius: var(--btrix-border-radius-top, 0)
        var(--btrix-border-radius-to, 0) var(--btrix-border-radius-bottom, 0)
        var(--btrix-border-radius-bottom, 0);
      height: 2.5rem;
    }
  `;

  protected willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (changedProperties.has("sort")) {
      void this.fetchBrowserProfiles();
    }
  }

  render() {
    return html`${pageHeader({
        title: msg("Browser Profiles"),
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
        classNames: tw`mb-3`,
      })}
      <div class="pb-1">${this.renderTable()}</div>`;
  }

  private renderTable() {
    const headerCells = [
      {
        sortBy: "name",
        sortDirection: 1,
        className: "pl-3",
        label: msg("Name"),
      },
      { sortBy: "url", sortDirection: 1, label: msg("Visited URLs") },
      { sortBy: "created", sortDirection: -1, label: msg("Created On") },
      { sortBy: "modified", sortDirection: -1, label: msg("Last Updated") },
    ];
    const sortProps: Record<
      SortValues,
      { name: string; label: string; className: string }
    > = {
      none: {
        name: "arrow-down-up",
        label: msg("Sortable"),
        className: tw`text-xs opacity-0 hover:opacity-100 group-hover:opacity-100`,
      },
      ascending: {
        name: "sort-up-alt",
        label: msg("Ascending"),
        className: tw`text-base`,
      },
      descending: {
        name: "sort-down",
        label: msg("Descending"),
        className: tw`text-base`,
      },
    };

    const getSortIcon = (sortValue: SortValues) => {
      const { name, label, className } = sortProps[sortValue];
      return html`
        <sl-icon
          class=${clsx(tw`ml-1 text-neutral-900 transition-opacity`, className)}
          name=${name}
          label=${label}
        ></sl-icon>
      `;
    };

    return html`
      <btrix-table class="-mx-3 overflow-x-auto px-3">
        <btrix-table-head class="mb-2">
          ${headerCells.map(({ sortBy, sortDirection, label, className }) => {
            const isSorting = sortBy === this.sort.sortBy;
            const sortValue =
              (isSorting && SortDirection.get(this.sort.sortDirection)) ||
              "none";
            // TODO implement sort render logic in table-header-cell
            return html`
              <btrix-table-header-cell
                class="${className} group cursor-pointer rounded transition-colors hover:bg-primary-50"
                ariaSort=${sortValue}
                @click=${() => {
                  if (isSorting) {
                    this.sort = {
                      ...this.sort,
                      sortDirection: this.sort.sortDirection * -1,
                    };
                  } else {
                    this.sort = {
                      sortBy,
                      sortDirection,
                    };
                  }
                }}
              >
                ${label} ${getSortIcon(sortValue)}
              </btrix-table-header-cell>
            `;
          })}
          <btrix-table-header-cell>
            <span class="sr-only">${msg("Row Actions")}</span>
          </btrix-table-header-cell>
        </btrix-table-head>
        <btrix-table-body
          class=${clsx(
            "relative rounded border",
            this.browserProfiles == null && this.isLoading && tw`min-h-48`,
          )}
        >
          ${when(this.browserProfiles, ({ total, items }) =>
            total ? html` ${items.map(this.renderItem)} ` : nothing,
          )}
          ${when(this.isLoading, this.renderLoading)}
        </btrix-table-body>
      </btrix-table>
      ${when(this.browserProfiles, ({ total, page, pageSize }) =>
        total
          ? html`
              <footer class="mt-6 flex justify-center">
                <btrix-pagination
                  page=${page}
                  totalCount=${total}
                  size=${pageSize}
                  @page-change=${async (e: PageChangeEvent) => {
                    void this.fetchBrowserProfiles({ page: e.detail.page });
                  }}
                ></btrix-pagination>
              </footer>
            `
          : html`
              <div class="border-b border-t py-5">
                <p class="text-0-500 text-center">
                  ${msg("No browser profiles yet.")}
                </p>
              </div>
            `,
      )}
    `;
  }

  private readonly renderLoading = () =>
    html`<div
      class="absolute left-0 top-0 z-10 flex h-full w-full items-center justify-center bg-white/50 text-3xl"
    >
      <sl-spinner></sl-spinner>
    </div>`;

  private readonly renderItem = (data: Profile) => {
    return html`
      <btrix-table-row
        class="cursor-pointer select-none transition-all focus-within:bg-neutral-50 hover:bg-neutral-50 hover:shadow-none"
      >
        <btrix-table-cell
          class="flex-col items-center justify-center pl-3"
          rowClickTarget="a"
        >
          <a
            class="flex items-center gap-3"
            href=${`${this.navigate.orgBasePath}/browser-profiles/profile/${data.id}`}
            @click=${this.navigate.link}
          >
            <span class="truncate">${data.name}</span>
          </a>
        </btrix-table-cell>
        <btrix-table-cell>
          <div class="truncate">${data.origins[0]}</div>
          ${data.origins.length > 1
            ? html`<sl-tooltip class="invert-tooltip">
                <span slot="content" class=" break-words"
                  >${data.origins.slice(1).join(", ")}</span
                >
                <btrix-badge class="ml-2">
                  ${msg(str`+${data.origins.length - 1}`)}
                </btrix-badge>
              </sl-tooltip>`
            : nothing}
        </btrix-table-cell>
        <btrix-table-cell class="whitespace-nowrap tabular-nums">
          <sl-tooltip
            content=${msg(str`By ${data.createdByName}`)}
            ?disabled=${!data.createdByName}
          >
            <btrix-format-date
              date=${data.created}
              month="2-digit"
              day="2-digit"
              year="numeric"
              hour="2-digit"
              minute="2-digit"
            ></btrix-format-date>
          </sl-tooltip>
        </btrix-table-cell>
        <btrix-table-cell class="whitespace-nowrap tabular-nums">
          <sl-tooltip
            content=${msg(str`By ${data.modifiedByName || data.createdByName}`)}
            ?disabled=${!data.createdByName}
          >
            <btrix-format-date
              date=${
                // NOTE older profiles may not have "modified" data
                data.modified || data.created
              }
              month="2-digit"
              day="2-digit"
              year="numeric"
              hour="2-digit"
              minute="2-digit"
            ></btrix-format-date>
          </sl-tooltip>
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
      const data = await this.api.fetch<Profile & { error?: boolean }>(
        `/orgs/${this.orgId}/profiles/${profile.id}`,
        {
          method: "DELETE",
        },
      );

      if (data.error && data.crawlconfigs) {
        this.notify.toast({
          message: msg(
            html`Could not delete <strong>${profile.name}</strong>, in use by
              <strong
                >${data.crawlconfigs.map(({ name }) => name).join(", ")}</strong
              >. Please remove browser profile from Workflow to continue.`,
          ),
          variant: "warning",
          icon: "exclamation-triangle",
          duration: 15000,
        });
      } else {
        this.notify.toast({
          message: msg(html`Deleted <strong>${profile.name}</strong>.`),
          variant: "success",
          icon: "check2-circle",
          id: "browser-profile-deleted-status",
        });

        void this.fetchBrowserProfiles();
      }
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn't delete browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "browser-profile-deleted-status",
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

  /**
   * Fetch browser profiles and update internal state
   */
  private async fetchBrowserProfiles(
    params?: APIPaginationQuery,
  ): Promise<void> {
    try {
      this.isLoading = true;
      const data = await this.getProfiles({
        page:
          params?.page ||
          this.browserProfiles?.page ||
          parsePage(new URLSearchParams(location.search).get("page")),
        pageSize:
          params?.pageSize ||
          this.browserProfiles?.pageSize ||
          INITIAL_PAGE_SIZE,
      });

      this.browserProfiles = data;
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve browser profiles at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "browser-profile-status",
      });
    } finally {
      this.isLoading = false;
    }
  }

  private async getProfiles(params: APIPaginationQuery) {
    const query = queryString.stringify(
      {
        ...params,
        ...this.sort,
      },
      {
        arrayFormat: "comma",
      },
    );

    const data = await this.api.fetch<APIPaginatedList<Profile>>(
      `/orgs/${this.orgId}/profiles?${query}`,
    );

    return data;
  }
}
