import { localized, msg, str } from "@lit/localize";
import { nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { Profile } from "./types";

import type { SelectNewDialogEvent } from ".";

import type { PageChangeEvent } from "@/components/ui/pagination";
import type { APIPaginatedList, APIPaginationQuery } from "@/types/api";
import type { Browser } from "@/types/browser";
import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import { getLocale } from "@/utils/localization";

const INITIAL_PAGE_SIZE = 20;

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-list
 *  authState=${authState}
 *  orgId=${orgId}
 * ></btrix-browser-profiles-list>
 * ```
 */
@localized()
@customElement("btrix-browser-profiles-list")
export class BrowserProfilesList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: Boolean })
  isCrawler = false;

  @state()
  browserProfiles?: APIPaginatedList<Profile>;

  protected willUpdate(
    changedProperties: PropertyValues<this> & Map<string, unknown>,
  ) {
    if (changedProperties.has("orgId")) {
      void this.fetchBrowserProfiles();
    }
  }

  render() {
    return html`<header>
        <div class="mb-2 flex flex-wrap justify-between gap-2 border-b pb-3">
          <h1 class="mb-2 text-xl font-semibold leading-8 md:mb-0">
            ${msg("Browser Profiles")}
          </h1>
          ${when(
            this.isCrawler,
            () => html`
              <sl-button
                variant="primary"
                size="small"
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
            `,
          )}
        </div>
      </header>
      <div class="overflow-auto px-2 pb-1">${this.renderTable()}</div>`;
  }

  private renderTable() {
    return html`
      <btrix-table
        style="grid-template-columns: [clickable-start] 60ch repeat(2, auto) [clickable-end] min-content; --btrix-cell-padding-left: var(--sl-spacing-x-small); --btrix-cell-padding-right: var(--sl-spacing-x-small);"
      >
        <btrix-table-head class="mb-2">
          <btrix-table-header-cell>${msg("Name")}</btrix-table-header-cell>
          <btrix-table-header-cell>
            ${msg("Last Updated")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>
            ${msg("Visited URLs")}
          </btrix-table-header-cell>
          <btrix-table-header-cell>
            <span class="sr-only">${msg("Row Actions")}</span>
          </btrix-table-header-cell>
        </btrix-table-head>
        ${when(this.browserProfiles, ({ total, items }) =>
          total
            ? html`
                <btrix-table-body
                  style="--btrix-row-gap: var(--sl-spacing-x-small); --btrix-cell-padding-top: var(--sl-spacing-2x-small); --btrix-cell-padding-bottom: var(--sl-spacing-2x-small);"
                >
                  ${items.map(this.renderItem)}
                </btrix-table-body>
              `
            : nothing,
        )}
      </btrix-table>
      ${when(
        this.browserProfiles,
        ({ total, page, pageSize }) =>
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
                  <p class="text-center text-0-500">
                    ${msg("No browser profiles yet.")}
                  </p>
                </div>
              `,
        this.renderLoading,
      )}
    `;
  }

  private readonly renderLoading = () =>
    html`<div class="my-24 flex w-full items-center justify-center text-3xl">
      <sl-spinner></sl-spinner>
    </div>`;

  private readonly renderItem = (data: Profile) => {
    return html`
      <btrix-table-row
        class="cursor-pointer select-none rounded border shadow transition-all focus-within:bg-neutral-50 hover:bg-neutral-50 hover:shadow-none"
      >
        <btrix-table-cell
          class="flex-col items-center justify-center"
          rowClickTarget="a"
        >
          <a
            class="flex items-center gap-3"
            href=${`${this.orgBasePath}/browser-profiles/profile/${data.id}`}
            @click=${this.navLink}
          >
            ${data.name}
          </a>
        </btrix-table-cell>
        <btrix-table-cell class="whitespace-nowrap">
          <sl-format-date
            lang=${getLocale()}
            date=${
              `${
                // NOTE older profiles may not have "modified" data
                data.modified || data.created
              }Z` /** Z for UTC */
            }
            month="2-digit"
            day="2-digit"
            year="2-digit"
            hour="2-digit"
            minute="2-digit"
          ></sl-format-date>
        </btrix-table-cell>
        <btrix-table-cell>
          ${data.origins[0]}${data.origins.length > 1
            ? html`<sl-tooltip
                class="invert-tooltip"
                content=${data.origins.slice(1).join(", ")}
              >
                <sl-tag size="small" class="ml-2">
                  ${msg(str`+${data.origins.length - 1}`)}
                </sl-tag>
              </sl-tooltip>`
            : nothing}
        </btrix-table-cell>
        <btrix-table-cell class="px-1">
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
            @click=${() => {
              void this.duplicateProfile(data);
            }}
          >
            <sl-icon slot="prefix" name="files"></sl-icon>
            ${msg("Duplicate Profile")}
          </sl-menu-item>
          <sl-menu-item
            style="--sl-color-neutral-700: var(--danger)"
            @click=${() => {
              void this.deleteProfile(data);
            }}
          >
            <sl-icon slot="prefix" name="trash3"></sl-icon>
            ${msg("Delete")}
          </sl-menu-item>
        </sl-menu>
      </btrix-overflow-dropdown>
    `;
  }

  private async duplicateProfile(profile: Profile) {
    const url = profile.origins[0];

    try {
      const data = await this.createBrowser({ url });

      this.notify({
        message: msg("Starting up browser with selected profile..."),
        variant: "success",
        icon: "check2-circle",
      });

      this.navTo(
        `${this.orgBasePath}/browser-profiles/profile/browser/${
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
      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async deleteProfile(profile: Profile) {
    try {
      const data = await this.apiFetch<Profile & { error?: boolean }>(
        `/orgs/${this.orgId}/profiles/${profile.id}`,
        this.authState!,
        {
          method: "DELETE",
        },
      );

      if (data.error && data.crawlconfigs) {
        this.notify({
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
        this.notify({
          message: msg(html`Deleted <strong>${profile.name}</strong>.`),
          variant: "success",
          icon: "check2-circle",
        });

        void this.fetchBrowserProfiles();
      }
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't delete browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async createBrowser({ url }: { url: string }) {
    const params = {
      url,
    };

    return this.apiFetch<Browser>(
      `/orgs/${this.orgId}/profiles/browser`,
      this.authState!,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
  }

  /**
   * Fetch browser profiles and update internal state
   */
  private async fetchBrowserProfiles(
    params?: APIPaginationQuery,
  ): Promise<void> {
    try {
      const data = await this.getProfiles({
        page: params?.page || this.browserProfiles?.page || 1,
        pageSize:
          params?.pageSize ||
          this.browserProfiles?.pageSize ||
          INITIAL_PAGE_SIZE,
      });

      this.browserProfiles = data;
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve browser profiles at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getProfiles(params: APIPaginationQuery) {
    const query = queryString.stringify(params, {
      arrayFormat: "comma",
    });

    const data = await this.apiFetch<APIPaginatedList<Profile>>(
      `/orgs/${this.orgId}/profiles?${query}`,
      this.authState!,
    );

    return data;
  }
}
