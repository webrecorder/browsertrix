import { consume } from "@lit/context";
import { localized, msg } from "@lit/localize";
import { Task } from "@lit/task";
import type {
  SlChangeEvent,
  SlDrawer,
  SlSelect,
} from "@shoelace-style/shoelace";
import clsx from "clsx";
import { html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import queryString from "query-string";

import type { NewBrowserProfileDialog } from "./new-browser-profile-dialog";
import { originsWithRemainder } from "./templates/origins-with-remainder";
import { type ProfileUpdatedEvent } from "./types";

import { BtrixElement } from "@/classes/BtrixElement";
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
import { AppStateService } from "@/utils/state";
import { tw } from "@/utils/tailwind";

type SelectedProfile = Partial<Profile> & Pick<Profile, "id" | "name">;
type SelectBrowserProfileChangeDetail = {
  value: SelectedProfile | undefined;
};

const isFullProfile = (
  profile: SelectedProfile | Profile,
): profile is Profile => "modified" in profile || "created" in profile;

// TODO Paginate results
const INITIAL_PAGE_SIZE = 1000;
const NEW_PROFILE_KEY = "_new";

export type SelectBrowserProfileChangeEvent =
  CustomEvent<SelectBrowserProfileChangeDetail>;

/**
 * Browser profile select dropdown
 *
 * Usage example:
 * ```ts
 * <btrix-select-browser-profile
 *   on-change=${({value}) => selectedProfile = value}
 * ></btrix-select-browser-profile>
 * ```
 *
 * @event on-change
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

  @query("sl-select")
  private readonly select?: SlSelect | null;

  @query("sl-drawer")
  private readonly drawer?: SlDrawer | null;

  @query("btrix-new-browser-profile-dialog")
  private readonly newBrowserProfileDialog?: NewBrowserProfileDialog | null;

  public get value() {
    return this.select?.value as string;
  }

  private readonly profilesTask = new Task(this, {
    task: async (_args, { signal }) => {
      return this.getProfiles(
        {
          sortBy: "name",
          sortDirection: SortDirection.Ascending,
          pageSize: INITIAL_PAGE_SIZE,
        },
        signal,
      );
    },
    args: () => [] as const,
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
      <sl-select
        label=${msg("Browser Profile")}
        value=${this.profileId || selectedProfile?.id || ""}
        placeholder=${browserProfiles ? stringFor.none : msg("Loading")}
        size=${ifDefined(this.size)}
        hoist
        clearable
        @sl-change=${this.onChange}
        @sl-hide=${this.stopProp}
        @sl-after-hide=${this.stopProp}
      >
        ${loading ? html`<sl-spinner slot="prefix"></sl-spinner>` : nothing}
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
      </sl-select>

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
              const { id, name } = e.detail;

              if (id) {
                void this.profilesTask.run();
                await this.profilesTask.taskComplete;

                this.dispatchEvent(
                  new CustomEvent<SelectBrowserProfileChangeDetail>(
                    "on-change",
                    {
                      detail: {
                        value: { id, name: name ?? id },
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
            tw`part-[base]:flex-wrap`,
            tw`part-[label]:basis-1/2 part-[label]:overflow-hidden`,
            tw`part-[suffix]:basis-full part-[suffix]:overflow-hidden`,
            i && tw`border-t`,
          )}
        >
          <span class="font-medium">${profile.name}</span>
          <div slot="suffix" class="w-full pl-2.5 pt-0.5">
            ${originsWithRemainder(profile.origins, {
              disablePopover: true,
            })}
          </div>
        </sl-option>
      </btrix-popover>
    `;

    const profiles = browserProfiles.items;
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

    return html`
      ${profiles.length
        ? html`<sl-option value="">${stringFor.none}</sl-option>`
        : nothing}
      ${suggestions.length
        ? html`
            <sl-divider></sl-divider>
            <sl-menu-label> ${msg("Suggested Profiles")} </sl-menu-label>
            ${suggestions.map(option)}
          `
        : nothing}
      ${rest.length
        ? html`
            <sl-divider></sl-divider>
            <sl-menu-label
              >${suggestions.length
                ? msg("Other Saved Profiles")
                : msg("Saved Profiles")}</sl-menu-label
            >
            ${rest.map(option)}
          `
        : nothing}
      ${when(
        !this.allowNew && !profiles.length,
        () =>
          html`<sl-menu-label
            class="part-[base]:flex part-[base]:items-center part-[base]:justify-between"
          >
            <span>${msg("No browser profiles found.")}</span>
            <btrix-link
              class="ml-auto"
              href="${this.navigate.orgBasePath}/${OrgTab.BrowserProfiles}"
              target="_blank"
            >
              ${msg("Manage Profiles")}
            </btrix-link>
          </sl-menu-label>`,
      )}
      ${when(
        this.allowNew,
        () =>
          html`${profiles.length ? html`<sl-divider></sl-divider>` : nothing}
            <sl-option value=${NEW_PROFILE_KEY}>
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              ${msg("New Browser Profile")}
            </sl-option>`,
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

  private async onChange(e: SlChangeEvent) {
    const el = e.currentTarget as SlSelect;
    const profileId = el.value as string;

    if (profileId === NEW_PROFILE_KEY) {
      e.preventDefault();

      // Revert value
      el.value = this.profileId || "";

      if (this.newBrowserProfileDialog) {
        this.newBrowserProfileDialog.show();
      } else {
        console.debug("no <btrix-new-browser-profile-dialog>");
      }
      return;
    }

    this.selectedProfile = this.findProfileById(profileId);

    await this.updateComplete;

    this.dispatchEvent(
      new CustomEvent<SelectBrowserProfileChangeDetail>("on-change", {
        detail: {
          value: this.selectedProfile,
        },
      }),
    );
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

  private async getProfile(id: string, signal: AbortSignal) {
    const data = await this.api.fetch<Profile>(
      `/orgs/${this.orgId}/profiles/${id}`,
      { signal },
    );

    return data;
  }

  /**
   * Stop propagation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: CustomEvent) {
    e.stopPropagation();
  }
}
