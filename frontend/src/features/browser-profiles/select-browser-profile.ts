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

import { BtrixElement } from "@/classes/BtrixElement";
import { none } from "@/layouts/empty";
import { pageHeading } from "@/layouts/page";
import { CrawlerChannelImage, type Profile } from "@/pages/org/types";
import { OrgTab } from "@/routes";
import type {
  APIPaginatedList,
  APIPaginationQuery,
  APISortQuery,
} from "@/types/api";
import { SortDirection } from "@/types/utils";
import { AppStateService } from "@/utils/state";
import { tw } from "@/utils/tailwind";

type SelectBrowserProfileChangeDetail = {
  value: Profile | undefined;
};

// TODO Paginate results
const INITIAL_PAGE_SIZE = 1000;

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
  @property({ type: String })
  size?: SlSelect["size"];

  @property({ type: String })
  profileId?: string;

  @state()
  selectedProfile?: Profile;

  @query("sl-select")
  private readonly select?: SlSelect | null;

  @query("sl-drawer")
  private readonly drawer?: SlDrawer | null;

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
      if (!profileId || !profiles || signal.aborted) return;

      this.selectedProfile = this.findProfileById(profileId);
    },
    args: () => [this.profileId, this.profilesTask.value] as const,
  });

  private findProfileById(profileId?: string) {
    if (!profileId) return;
    return this.profilesTask.value?.items.find(({ id }) => id === profileId);
  }

  render() {
    const selectedProfile = this.selectedProfile;
    const browserProfiles = this.profilesTask.value;

    return html`
      <sl-select
        label=${msg("Browser Profile")}
        value=${selectedProfile?.id || ""}
        placeholder=${browserProfiles
          ? msg("No custom profile")
          : msg("Loading")}
        size=${ifDefined(this.size)}
        hoist
        clearable
        @sl-change=${this.onChange}
        @sl-hide=${this.stopProp}
        @sl-after-hide=${this.stopProp}
      >
        ${when(
          selectedProfile?.proxyId,
          (proxyId) => html`
            <btrix-proxy-badge
              slot="suffix"
              proxyId=${proxyId}
            ></btrix-proxy-badge>
          `,
        )}
        ${browserProfiles
          ? html`
              <sl-option value="">${msg("No custom profile")}</sl-option>
              ${browserProfiles.items.length
                ? html`
                    <sl-divider></sl-divider>
                    <sl-menu-label>${msg("Saved Profiles")}</sl-menu-label>
                  `
                : nothing}
            `
          : html` <sl-spinner slot="prefix"></sl-spinner> `}
        ${browserProfiles?.items.map(
          (profile, i) => html`
            <sl-option
              value=${profile.id}
              class=${clsx(
                tw`part-[base]:flex-wrap`,
                tw`part-[prefix]:order-2`,
                tw`part-[label]:order-1 part-[label]:basis-1/2 part-[label]:overflow-hidden`,
                tw`part-[suffix]:order-3 part-[suffix]:basis-full part-[suffix]:overflow-hidden`,
                i && tw`border-t`,
              )}
            >
              <span class="font-medium">${profile.name}</span>
              <span
                class="whitespace-nowrap text-xs text-neutral-500"
                slot="prefix"
              >
                ${this.localize.relativeDate(
                  profile.modified || profile.created,
                  { capitalize: true },
                )}
              </span>
              <div
                slot="suffix"
                class="flex w-full items-center justify-between gap-1.5 overflow-hidden pl-2.5 pt-0.5"
              >
                <btrix-code
                  class="w-0 flex-1 text-xs"
                  language="url"
                  value=${profile.origins[0]}
                  noWrap
                  truncate
                ></btrix-code>
                ${when(
                  profile.proxyId,
                  (proxyId) => html`
                    <btrix-proxy-badge proxyId=${proxyId}></btrix-proxy-badge>
                  `,
                )}
              </div>
            </sl-option>
          `,
        )}
        ${browserProfiles && !browserProfiles.total
          ? this.renderNoProfiles()
          : ""}
        <div slot="help-text" class="flex justify-between">
          ${selectedProfile
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
            : browserProfiles
              ? html`
                  <btrix-link
                    class="ml-auto"
                    href="${this.navigate
                      .orgBasePath}/${OrgTab.BrowserProfiles}"
                    target="_blank"
                  >
                    ${msg("View Browser Profiles")}
                  </btrix-link>
                `
              : nothing}
        </div>
      </sl-select>

      ${browserProfiles || selectedProfile
        ? this.renderSelectedProfileInfo()
        : ""}
    `;
  }

  private renderSelectedProfileInfo() {
    const profileContent = (profile: Profile) => {
      const modifiedByAnyDate = [
        profile.modifiedCrawlDate,
        profile.modified,
        profile.created,
      ].reduce((a, b) => (b && a && b > a ? b : a), profile.created);

      return html`${pageHeading({ content: msg("Overview"), level: 3 })}
        <section class="mt-5">
          <btrix-desc-list>
            <btrix-desc-list-item label=${msg("Description")}>
              ${profile.description
                ? html`
                    <!-- display: inline -->
                    <div
                      class="text-balanced whitespace-pre-line font-sans leading-relaxed text-neutral-600"
                      >${profile.description}</div
                    >
                  `
                : none}
            </btrix-desc-list-item>
            <btrix-desc-list-item label=${msg("Tags")}>
              ${profile.tags.length
                ? html`<div class="mt-1 flex flex-wrap gap-1.5">
                    ${profile.tags.map(
                      (tag) => html`<btrix-tag>${tag}</btrix-tag>`,
                    )}
                  </div>`
                : none}
            </btrix-desc-list-item>
            <btrix-desc-list-item label=${msg("Crawler Channel")}>
              <btrix-crawler-channel-badge
                channelId=${profile.crawlerChannel ||
                CrawlerChannelImage.Default}
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
              ${this.localize.relativeDate(
                modifiedByAnyDate || profile.created,
                { capitalize: true },
              )}
            </btrix-desc-list-item>
          </btrix-desc-list>
        </section>

        <sl-divider class="my-5"></sl-divider>

        ${pageHeading({ content: msg("Configured Sites"), level: 3 })}
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
      class="[--body-spacing:var(--sl-spacing-medium)] [--footer-spacing:var(--sl-spacing-x-small)_var(--sl-spacing-medium)] [--header-spacing:var(--sl-spacing-medium)]  part-[header]:[border-bottom:1px_solid_var(--sl-panel-border-color)]"
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

      ${when(this.selectedProfile, profileContent)}
    </sl-drawer>`;
  }

  private renderNoProfiles() {
    return html`
      <div class="mx-2 text-sm text-neutral-500">
        <span class="inline-block align-middle"
          >${msg("This org doesn't have any custom profiles yet.")}</span
        >
        <a
          href=${`${this.navigate.orgBasePath}/browser-profiles?new=browser-profile`}
          class="font-medium text-primary hover:text-primary-500"
          target="_blank"
          @click=${(e: Event) => {
            const select = (e.target as HTMLElement).closest<SlSelect>(
              "sl-select",
            );
            if (select) {
              select.blur();
              // TODO what is this? why isn't it documented in Shoelace?
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (select as any).dropdown?.hide();
            }
          }}
          ><span class="inline-block align-middle"
            >${msg("Create profile")}</span
          >
          <sl-icon
            class="inline-block align-middle"
            name="box-arrow-up-right"
          ></sl-icon
        ></a>
      </div>
    `;
  }

  private async onChange(e: SlChangeEvent) {
    const profileId = (e.target as SlSelect | null)?.value as string;
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

  /**
   * Stop propagation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: CustomEvent) {
    e.stopPropagation();
  }
}
