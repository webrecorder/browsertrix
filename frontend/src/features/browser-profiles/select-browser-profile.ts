import { localized, msg } from "@lit/localize";
import { type SlSelect } from "@shoelace-style/shoelace";
import { html, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import orderBy from "lodash/fp/orderBy";

import { BtrixElement } from "@/classes/BtrixElement";
import type { Profile } from "@/pages/org/types";
import type { APIPaginatedList } from "@/types/api";

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
                <div class="text-xs">
                  <btrix-format-date
                    .date=${profile.modified}
                    month="2-digit"
                    day="2-digit"
                    year="numeric"
                  ></btrix-format-date>
                </div></div
            ></sl-option>
          `,
        )}
        ${this.browserProfiles && !this.browserProfiles.length
          ? this.renderNoProfiles()
          : ""}
        <div slot="help-text" class="flex justify-between">
          ${this.selectedProfile
            ? html`
                <span>
                  ${msg("Last updated")}
                  <btrix-format-date
                    .date=${this.selectedProfile.modified}
                    month="2-digit"
                    day="2-digit"
                    year="numeric"
                    hour="2-digit"
                    minute="2-digit"
                  ></btrix-format-date>
                </span>
                ${this.selectedProfile.proxyId
                  ? html` <span>
                      ${msg("Using proxy: ")}
                      <b>${this.selectedProfile.proxyId}</b>
                    </span>`
                  : ``}
                <a
                  class="flex items-center gap-1 text-blue-500 hover:text-blue-600"
                  href=${`${this.navigate.orgBasePath}/browser-profiles/profile/${this.selectedProfile.id}`}
                  target="_blank"
                >
                  ${msg("Check Profile")}
                  <sl-icon name="box-arrow-up-right"></sl-icon>
                </a>
              `
            : this.browserProfiles
              ? html`
                  <a
                    class="ml-auto flex items-center gap-1 text-blue-500 hover:text-blue-600"
                    href=${`${this.navigate.orgBasePath}/browser-profiles`}
                    target="_blank"
                  >
                    ${msg("View Profiles")}
                    <sl-icon name="box-arrow-up-right"></sl-icon>
                  </a>
                `
              : nothing}
        </div>
      </sl-select>

      ${this.browserProfiles?.length ? this.renderSelectedProfileInfo() : ""}
    `;
  }

  private renderSelectedProfileInfo() {
    if (!this.selectedProfile?.description) return;

    return html`<div class="my-2 rounded border pl-1">
      <btrix-details style="--margin-bottom: 0; --border-bottom: 0;">
        <div slot="title" class="text-xs leading-normal text-neutral-600">
          ${msg("Description")}
        </div>
        <!-- display: inline -->
        <div class="whitespace-pre-line p-3 text-xs leading-normal"
          >${this.selectedProfile.description}</div
        >
      </btrix-details>
    </div>`;
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
