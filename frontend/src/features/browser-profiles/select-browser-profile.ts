import { consume } from "@lit/context";
import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type { SlDrawer, SlSelect } from "@shoelace-style/shoelace";
import clsx from "clsx";
import Fuse from "fuse.js";
import { html, nothing, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import { nanoid } from "nanoid";
import queryString from "query-string";

import type { NewBrowserProfileDialog } from "./new-browser-profile-dialog";
import { originsWithRemainder } from "./templates/origins-with-remainder";
import { type ProfileUpdatedEvent } from "./types";

import { BtrixElement } from "@/classes/BtrixElement";
import {
  type Combobox,
  type ComboboxChangeEvent,
  type ComboboxSearchEvent,
  type ComboboxSelectEvent,
} from "@/components/ui/combobox";
import {
  orgCrawlerChannelsContext,
  type OrgCrawlerChannelsContext,
} from "@/context/org-crawler-channels";
import {
  orgProxiesContext,
  type OrgProxiesContext,
} from "@/context/org-proxies";
import { none } from "@/layouts/empty";
import { pageHeading } from "@/layouts/page";
import { CrawlerChannelImage, type Profile } from "@/pages/org/types";
import { OrgTab } from "@/routes";
import { stringFor } from "@/strings/ui";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import { SortDirection } from "@/types/utils";
import { getDefaultProxyId } from "@/utils/crawler";
import { isNotEqual } from "@/utils/is-not-equal";
import { type SearchValues } from "@/utils/searchValues";
import { AppStateService } from "@/utils/state";
import { tw } from "@/utils/tailwind";

type SelectedProfile = Partial<Profile> &
  Pick<Profile, "id" | "name" | "proxyId">;
type SelectBrowserProfileChangeDetail = {
  value: SelectedProfile | undefined;
};

const isFullProfile = (
  profile: SelectedProfile | Profile,
): profile is Profile => "modified" in profile || "created" in profile;

enum SearchStrategy {
  // Search using `search-values` API
  SearchValues,
  // Client-side search
  Client,
}

const TEMP_ID_PREFIX = "#temp";
const CLIENT_SEARCH_MAX_PAGE_SIZE = 50;

export type SelectBrowserProfileChangeEvent =
  CustomEvent<SelectBrowserProfileChangeDetail>;

/**
 * Users can select an existing browser profile or create a new profile.
 *
 * @fires on-change
 */
@customElement("btrix-select-browser-profile")
@localized()
export class SelectBrowserProfile extends BtrixElement {
  @consume({ context: orgProxiesContext, subscribe: true })
  private readonly proxies?: OrgProxiesContext;

  @consume({ context: orgCrawlerChannelsContext, subscribe: true })
  private readonly crawlerChannels?: OrgCrawlerChannelsContext;

  @property({ type: String })
  size?: SlSelect["size"];

  @property({ type: String })
  profileId?: string;

  @property({ type: String })
  profileName?: string;

  @property({ type: String })
  defaultProxyId?: string;

  @property({ type: String })
  defaultCrawlerChannel?: string;

  /**
   * List of origins to match to prioritize profile options
   */
  @property({ type: Array, hasChanged: isNotEqual })
  suggestOrigins?: string[];

  @state()
  selectedProfile?: SelectedProfile;

  @property({ type: Boolean })
  allowNew = false;

  @state()
  searchText?: string;

  @query("btrix-combobox")
  private readonly select?: Combobox | null;

  @query("sl-drawer")
  private readonly drawer?: SlDrawer | null;

  @query("btrix-new-browser-profile-dialog")
  private readonly newBrowserProfileDialog?: NewBrowserProfileDialog | null;

  // Assign temporary IDs when searching by name
  #searchValuesMap = new Map</* ID: */ string, /* name: */ string>();

  public get value() {
    return this.select?.value;
  }

  private get searchStrategy() {
    if (!this.profilesTask.value) return;

    if (this.profilesTask.value.total > CLIENT_SEARCH_MAX_PAGE_SIZE) {
      return SearchStrategy.SearchValues;
    }

    return SearchStrategy.Client;
  }

  private readonly profilesTask = new Task(this, {
    task: async (_args, { signal }) => {
      return this.getProfiles(
        {
          sortBy: "modified",
          sortDirection: SortDirection.Descending,
          pageSize: CLIENT_SEARCH_MAX_PAGE_SIZE,
        },
        signal,
      );
    },
    args: () => [] as const,
  });

  private readonly searchValuesTask = new Task(this, {
    task: async (_args, { signal }) => {
      if (this.searchStrategy !== SearchStrategy.SearchValues) return;

      const { names } = await this.getSearchValues(signal);
      const values: { value: string; label: string }[] = [];

      this.#searchValuesMap = new Map();

      names.forEach((name) => {
        const tempId = `${TEMP_ID_PREFIX}${nanoid()}`;

        this.#searchValuesMap.set(tempId, name);
        values.push({ value: tempId, label: name });
      });

      return values;
    },
    args: () => [this.profilesTask.value?.total] as const,
  });

  private readonly searchDbTask = new Task(this, {
    task: async ([values]) => {
      if (!values) return;

      return new Fuse<{ value: string; label: string }>(values, {
        threshold: 0.2, // stricter; default is 0.6,
        keys: ["label"],
      });
    },
    args: () => [this.searchValuesTask.value] as const,
  });

  private readonly searchResultsTask = new Task(this, {
    task: async ([fuse, text]) => {
      if (!fuse || !text) return [];

      return fuse.search(text).map(({ item }) => item);
    },
    args: () => [this.searchDbTask.value, this.searchText] as const,
  });

  private readonly selectedProfileTask = new Task(this, {
    task: async ([profileId, profiles], { signal }) => {
      if (!profileId || !profiles) return;

      let profile = this.findProfileById(profileId);

      if (!profile) {
        try {
          profile = await this.getProfile(profileId, signal);
        } catch (err) {
          console.debug(err);
        }
      }

      this.selectedProfile = profile;

      return profile;
    },
    args: () => [this.profileId, this.profilesTask.value] as const,
  });

  private findProfileById(profileId?: string) {
    if (!profileId) return;
    return (
      this.profilesTask.value?.items.find(({ id }) => id === profileId) || {
        id: profileId,
        name: profileId,
      }
    );
  }

  render() {
    const selectedProfile = this.selectedProfile;
    const browserProfiles = this.profilesTask.value;
    const loading = !browserProfiles && !this.profileName;

    return html`
      <btrix-combobox
        label=${msg("Browser Profile")}
        value=${this.profileId || selectedProfile?.id || ""}
        placeholder=${browserProfiles ? stringFor.none : msg("Loading")}
        clearable
        ?loading=${loading}
        @btrix-clear=${this.handleClear}
        @btrix-search=${this.handleSearch}
        @btrix-change=${this.handleChange}
        @btrix-select=${this.handleSelect}
      >
        ${this.renderProfileOptions()}
        <div slot="help-text" class="flex justify-between">
          ${selectedProfile && isFullProfile(selectedProfile)
            ? html`
                <button
                  class="text-blue-500 transition-colors duration-fast hover:text-blue-600"
                  @click=${() => void this.drawer?.show()}
                >
                  ${msg("View Details")}
                </button>
                <span>
                  ${msg("Last saved")}
                  ${this.localize.relativeDate(
                    selectedProfile.modified || selectedProfile.created,
                    { capitalize: true },
                  )}
                </span>
              `
            : nothing}
        </div>
      </btrix-combobox>

      ${browserProfiles || selectedProfile
        ? this.renderSelectedProfileInfo()
        : ""}
      ${this.org && this.proxies && this.crawlerChannels
        ? html`<btrix-new-browser-profile-dialog
            defaultUrl=${ifDefined(
              this.suggestOrigins?.[0] && `https://${this.suggestOrigins[0]}`,
            )}
            defaultName=""
            .proxyServers=${this.proxies.servers}
            .crawlerChannels=${this.crawlerChannels}
            defaultProxyId=${ifDefined(
              this.defaultProxyId ?? getDefaultProxyId(this.org, this.proxies),
            )}
            defaultCrawlerChannel=${ifDefined(
              this.defaultCrawlerChannel ||
                this.org.crawlingDefaults?.crawlerChannel ||
                undefined,
            )}
            @btrix-updated=${async (e: ProfileUpdatedEvent) => {
              e.stopPropagation();
              const { id, name, proxyId } = e.detail;

              if (id) {
                void this.profilesTask.run();
                await this.profilesTask.taskComplete;

                this.dispatchEvent(
                  new CustomEvent<SelectBrowserProfileChangeDetail>(
                    "on-change",
                    {
                      detail: {
                        value: { id, name: name ?? id, proxyId },
                      },
                    },
                  ),
                );
              } else {
                console.debug("no id for updated profile", e.detail);
              }
            }}
          >
          </btrix-new-browser-profile-dialog>`
        : nothing}
    `;
  }

  private renderProfileOptions() {
    const browserProfiles = this.profilesTask.value;

    if (!browserProfiles) {
      if (this.profileName) {
        return html`<sl-option value=${ifDefined(this.profileId)}>
          ${this.profileName}
        </sl-option>`;
      }

      return;
    }

    const option = (profile: Profile, i: number) => html`
      <btrix-popover
        class="part-[body]:w-64"
        placement="left"
        trigger="hover"
        hoist
      >
        <div slot="content">${this.renderOverview(profile)}</div>

        <sl-option
          value=${profile.id}
          class=${clsx(
            tw`content-auto`,
            tw`part-[base]:flex-wrap`,
            tw`part-[label]:basis-1/2 part-[label]:overflow-hidden`,
            tw`part-[suffix]:basis-full part-[suffix]:overflow-hidden`,
            i && tw`border-t`,
          )}
        >
          <span class="font-medium">${profile.name}</span>
          <div slot="suffix" class="pointer-events-none w-full pl-2.5 pt-0.5">
            ${originsWithRemainder(profile.origins, {
              disablePopover: true,
            })}
          </div>
        </sl-option>
      </btrix-popover>
    `;

    const profiles = browserProfiles.items;

    let options: TemplateResult | undefined;

    if (
      this.searchStrategy === SearchStrategy.SearchValues &&
      this.searchText
    ) {
      options = html`${this.searchResultsTask.value?.map(
        ({ value, label }) =>
          html`<sl-option value=${value}>${label}</sl-option>`,
      )}`;
    } else {
      const priorityOrigins = this.suggestOrigins;
      const suggestions: Profile[] = [];
      let rest: Profile[] = [];

      if (priorityOrigins?.length) {
        profiles.forEach((profile) => {
          const { origins } = profile;
          if (
            origins.some((origin) =>
              priorityOrigins.includes(
                new URL(origin).hostname.replace(/^www\./, ""),
              ),
            )
          ) {
            suggestions.push(profile);
          } else {
            rest.push(profile);
          }
        });
      } else {
        rest = profiles;
      }

      options = html` ${suggestions.length
        ? html`<sl-divider class="first:hidden"></sl-divider>
            <btrix-option-group
              class="peer"
              label=${msg("Suggested Profiles")}
              ?hidden=${!!this.searchText}
            >
              ${suggestions.map(option)}
            </btrix-option-group> `
        : nothing}
      ${rest.length
        ? html`<sl-divider
              class="first:hidden peer-[hidden]:hidden"
            ></sl-divider>
            <btrix-option-group
              label=${suggestions.length
                ? msg("Other Saved Profiles")
                : msg("Saved Profiles")}
              ?hidden=${!!this.searchText}
            >
              ${rest.map(option)}
            </btrix-option-group> `
        : nothing}`;
    }

    return html`
      ${when(
        this.allowNew,
        () =>
          html`<sl-option slot="new-option">
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            ${msg("New Browser Profile")}
          </sl-option>`,
      )}
      ${profiles.length
        ? html`<sl-option value="">${stringFor.none}</sl-option>`
        : nothing}
      ${options}
      ${when(
        !this.allowNew && !browserProfiles.total,
        () =>
          html`<div
            class="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-neutral-500"
          >
            <span>${msg("No browser profiles found.")}</span>
            <btrix-link
              href="${this.navigate.orgBasePath}/${OrgTab.BrowserProfiles}"
              target="_blank"
            >
              ${msg("Manage Profiles")}
            </btrix-link>
          </div>`,
      )}
    `;
  }

  private renderSelectedProfileInfo() {
    const profileContent = (profile: Profile) => {
      return html`${pageHeading({ content: msg("Overview"), level: 3 })}
        <section class="mt-5">${this.renderOverview(profile)}</section>

        <sl-divider class="my-5"></sl-divider>

        ${pageHeading({ content: msg("Saved Sites"), level: 3 })}
        <section class="mt-5">
          ${profile.origins.length
            ? html`<ul class="divide-y rounded-lg border">
                ${profile.origins.map(
                  (origin) => html`
                    <li class="px-2 py-1">
                      <btrix-code
                        language="url"
                        value=${origin}
                        noWrap
                        truncate
                      ></btrix-code>
                    </li>
                  `,
                )}
              </ul>`
            : none}
        </section>

        <div slot="footer" class="text-left">
          <btrix-link
            class="text-xs"
            href="${this.navigate
              .orgBasePath}/${OrgTab.BrowserProfiles}/profile/${profile.id}"
            target="_blank"
          >
            ${msg("View More")}
          </btrix-link>
        </div> `;
    };

    return html` <sl-drawer
      class="[--body-spacing:var(--sl-spacing-medium)] [--footer-spacing:var(--sl-spacing-x-small)_var(--sl-spacing-medium)] [--header-spacing:var(--sl-spacing-medium)] part-[header]:[border-bottom:1px_solid_var(--sl-panel-border-color)]"
      @sl-show=${() => {
        // Hide any other open panels
        AppStateService.updateUserGuideOpen(false);
      }}
    >
      <span slot="label" class="flex gap-3">
        <sl-icon
          class="flex-shrink-0 text-base"
          name="window-fullscreen"
        ></sl-icon>
        <span class="leading-4">${this.selectedProfile?.name}</span>
      </span>

      ${this.selectedProfile && isFullProfile(this.selectedProfile)
        ? profileContent(this.selectedProfile)
        : nothing}
    </sl-drawer>`;
  }

  private readonly renderOverview = (profile: Profile) => {
    const modifiedByAnyDate = [
      profile.modifiedCrawlDate,
      profile.modified,
      profile.created,
    ].reduce((a, b) => (b && a && b > a ? b : a), profile.created);

    return html`<btrix-desc-list>
      <btrix-desc-list-item label=${msg("Description")}>
        ${profile.description
          ? html`
              <!-- display: inline -->
              <div
                class="text-balanced line-clamp-2 whitespace-pre-line font-sans leading-relaxed text-neutral-600"
                >${profile.description}</div
              >
            `
          : none}
      </btrix-desc-list-item>
      <btrix-desc-list-item label=${msg("Tags")}>
        ${profile.tags.length
          ? html`<div class="mt-1 flex flex-wrap gap-1.5">
              ${profile.tags.map((tag) => html`<btrix-tag>${tag}</btrix-tag>`)}
            </div>`
          : none}
      </btrix-desc-list-item>
      <btrix-desc-list-item label=${msg("Crawler Channel")}>
        <btrix-crawler-channel-badge
          channelId=${profile.crawlerChannel || CrawlerChannelImage.Default}
        ></btrix-crawler-channel-badge>
      </btrix-desc-list-item>
      ${when(
        profile.proxyId,
        (proxyId) => html`
          <btrix-desc-list-item label=${msg("Proxy")}>
            <btrix-proxy-badge proxyId=${proxyId}></btrix-proxy-badge>
          </btrix-desc-list-item>
        `,
      )}
      <btrix-desc-list-item label=${msg("Last Modified")}>
        ${this.localize.relativeDate(modifiedByAnyDate || profile.created, {
          capitalize: true,
        })}
      </btrix-desc-list-item>
    </btrix-desc-list>`;
  };

  private handleClear() {
    this.searchText = "";
    this.selectedProfile = undefined;
  }

  // Since the menu is not paginated, switch search strategy to use search-values API
  // if there are more profiles than shown in the menu
  private async handleSearch(e: ComboboxSearchEvent) {
    if (this.searchStrategy !== SearchStrategy.SearchValues) {
      return;
    }

    this.searchText = e.detail.text;
  }

  private async handleSelect(e: ComboboxSelectEvent) {
    const option = e.detail.item;

    this.searchText = "";

    if (option.slot === "new-option") {
      if (this.newBrowserProfileDialog) {
        this.newBrowserProfileDialog.show();
      } else {
        console.debug("no <btrix-new-browser-profile-dialog>");
      }
    }
  }

  private async handleChange(e: ComboboxChangeEvent) {
    const prevProfileId = this.selectedProfile?.id || this.profileId;
    const profileId = e.detail.value;

    if (profileId) {
      if (profileId.startsWith(TEMP_ID_PREFIX)) {
        const name = this.#searchValuesMap.get(profileId);

        if (name) {
          const profile = await this.getProfileByName(name);

          if (profile) {
            this.selectedProfile = profile;
          } else {
            console.debug("no profile with name", name);
          }

          return;
        } else {
          console.debug("no name for profile with ID", profileId);
          return;
        }
      } else {
        this.selectedProfile = this.findProfileById(profileId);
      }
    } else {
      if (this.select) {
        // Revert value
        this.select.value = this.profileId || "";
      }

      this.selectedProfile = undefined;
    }

    await this.updateComplete;

    if (profileId !== prevProfileId) {
      this.dispatchEvent(
        new CustomEvent<SelectBrowserProfileChangeDetail>("on-change", {
          detail: {
            value: this.selectedProfile,
          },
        }),
      );
    }
  }

  private async getProfiles(
    params: APIPaginationQuery & APISortQuery,
    signal: AbortSignal,
  ) {
    const query = queryString.stringify({
      ...params,
    });

    const data = await this.api.fetch<APIPaginatedList<Profile>>(
      `/orgs/${this.orgId}/profiles?${query}`,
      { signal },
    );

    return data;
  }

  private async getSearchValues(signal: AbortSignal) {
    return this.api.fetch<SearchValues>(
      `/orgs/${this.orgId}/profiles/search-values`,
      {
        signal,
      },
    );
  }

  private async getProfile(id: string, signal: AbortSignal) {
    const data = await this.api.fetch<Profile>(
      `/orgs/${this.orgId}/profiles/${id}`,
      { signal },
    );

    return data;
  }

  private async getProfileByName(name: string, signal?: AbortSignal) {
    const query = queryString.stringify({
      name,
      pageSize: 1,
    });

    const data = await this.api.fetch<APIPaginatedList<Profile>>(
      `/orgs/${this.orgId}/profiles?${query}`,
      { signal },
    );

    return (data.items[0] as Profile | undefined) || null;
  }
}
