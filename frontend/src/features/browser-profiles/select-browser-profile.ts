import { localized, msg } from "@lit/localize";
import type { SlDrawer, SlSelect } from "@shoelace-style/shoelace";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import orderBy from "lodash/fp/orderBy";

import { channelBadge, proxyBadge } from "./templates/badges";

import { BtrixElement } from "@/classes/BtrixElement";
import { none } from "@/layouts/empty";
import { pageHeading } from "@/layouts/page";
import { CrawlerChannelImage, type Profile } from "@/pages/org/types";
import { OrgTab } from "@/routes";
import type { APIPaginatedList } from "@/types/api";
import { AppStateService } from "@/utils/state";

type SelectBrowserProfileChangeDetail = {
  value: Profile | undefined;
};

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
  private selectedProfile?: Profile;

  @state()
  private browserProfiles?: Profile[];

  @query("sl-drawer")
  private readonly drawer?: SlDrawer | null;

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("profileId")) {
      void this.updateSelectedProfile();
    }
  }

  firstUpdated() {
    void this.updateSelectedProfile();
  }

  render() {
    return html`
      <sl-select
        name="profileid"
        label=${msg("Browser Profile")}
        value=${this.selectedProfile?.id || ""}
        placeholder=${this.browserProfiles
          ? msg("No custom profile")
          : msg("Loading")}
        size=${ifDefined(this.size)}
        hoist
        @sl-change=${this.onChange}
        @sl-focus=${() => {
          // Refetch to keep list up to date
          void this.fetchBrowserProfiles();
        }}
        @sl-hide=${this.stopProp}
        @sl-after-hide=${this.stopProp}
      >
        ${this.browserProfiles
          ? html`
              <sl-option value="">${msg("No custom profile")}</sl-option>
              <sl-divider></sl-divider>
            `
          : html` <sl-spinner slot="prefix"></sl-spinner> `}
        ${this.browserProfiles?.map(
          (profile) => html`
            <sl-option value=${profile.id}>
              ${profile.name}
              <div slot="suffix">
                <btrix-format-date
                  class="text-xs"
                  .date=${profile.modified || profile.created}
                  dateStyle="medium"
                ></btrix-format-date>
              </div>
            </sl-option>
          `,
        )}
        ${this.browserProfiles && !this.browserProfiles.length
          ? this.renderNoProfiles()
          : ""}
        <div slot="help-text" class="flex justify-between">
          ${this.selectedProfile
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
                    this.selectedProfile.modified ||
                      this.selectedProfile.created,
                  )}
                </span>
              `
            : this.browserProfiles
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

      ${this.browserProfiles?.length ? this.renderSelectedProfileInfo() : ""}
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
              ${channelBadge(
                profile.crawlerChannel || CrawlerChannelImage.Default,
              )}
            </btrix-desc-list-item>
            ${when(
              profile.proxyId,
              (proxy) => html`
                <btrix-desc-list-item label=${msg("Proxy")}>
                  ${proxyBadge(proxy)}
                </btrix-desc-list-item>
              `,
            )}
            <btrix-desc-list-item label=${msg("Last Modified")}>
              ${this.localize.relativeDate(
                modifiedByAnyDate || profile.created,
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

  private async onChange(e: Event) {
    this.selectedProfile = this.browserProfiles?.find(
      ({ id }) => id === (e.target as SlSelect | null)?.value,
    );

    await this.updateComplete;

    this.dispatchEvent(
      new CustomEvent<SelectBrowserProfileChangeDetail>("on-change", {
        detail: {
          value: this.selectedProfile,
        },
      }),
    );
  }

  private async updateSelectedProfile() {
    await this.fetchBrowserProfiles();
    await this.updateComplete;

    if (this.profileId && !this.selectedProfile) {
      this.selectedProfile = this.browserProfiles?.find(
        ({ id }) => id === this.profileId,
      );
    }
  }

  /**
   * Fetch browser profiles and update internal state
   */
  private async fetchBrowserProfiles(): Promise<void> {
    try {
      const data = await this.getProfiles();

      this.browserProfiles = orderBy(["name", "modified"])(["asc", "desc"])(
        data,
      ) as Profile[];
    } catch (e) {
      this.notify.toast({
        message: msg("Sorry, couldn't retrieve browser profiles at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
        id: "browser-profile-status",
      });
    }
  }

  private async getProfiles() {
    const data = await this.api.fetch<APIPaginatedList<Profile>>(
      `/orgs/${this.orgId}/profiles`,
    );

    return data.items;
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
