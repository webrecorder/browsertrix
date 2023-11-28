import { html } from "lit";
import { property, state, customElement } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";
import orderBy from "lodash/fp/orderBy";

import type { AuthState } from "@/utils/AuthService";
import LiteElement from "@/utils/LiteElement";
import type { Profile } from "@/pages/org/types";
import type { APIPaginatedList } from "@/types/api";

/**
 * Browser profile select dropdown
 *
 * Usage example:
 * ```ts
 * <btrix-select-browser-profile
 *   authState=${authState}
 *   orgId=${orgId}
 *   on-change=${({value}) => selectedProfile = value}
 * ></btrix-select-browser-profile>
 * ```
 *
 * @event on-change
 */
@customElement("btrix-select-browser-profile")
@localized()
export class SelectBrowserProfile extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @property({ type: String })
  profileId?: string;

  @state()
  private selectedProfile?: Profile;

  @state()
  private browserProfiles?: Profile[];

  protected firstUpdated() {
    this.fetchBrowserProfiles();
  }

  render() {
    return html`
      <sl-select
        name="profileid"
        label=${msg("Browser Profile")}
        value=${this.selectedProfile?.id || ""}
        placeholder=${this.browserProfiles
          ? msg("Default Profile")
          : msg("Loading")}
        hoist
        @sl-change=${this.onChange}
        @sl-focus=${() => {
          // Refetch to keep list up to date
          this.fetchBrowserProfiles();
        }}
        @sl-hide=${this.stopProp}
        @sl-after-hide=${this.stopProp}
      >
        ${this.browserProfiles
          ? html`
              <sl-option value="">${msg("Default Profile")}</sl-option>
              <sl-divider></sl-divider>
            `
          : html` <sl-spinner slot="prefix"></sl-spinner> `}
        ${this.browserProfiles?.map(
          (profile) => html`
            <sl-option value=${profile.id}>
              ${profile.name}
              <div slot="suffix">
                <div class="text-xs">
                  <sl-format-date
                    date=${`${profile.created}Z` /** Z for UTC */}
                    month="2-digit"
                    day="2-digit"
                    year="2-digit"
                  ></sl-format-date>
                </div></div
            ></sl-option>
          `
        )}
        ${this.browserProfiles && !this.browserProfiles.length
          ? this.renderNoProfiles()
          : ""}
      </sl-select>

      ${this.browserProfiles && this.browserProfiles.length
        ? this.renderSelectedProfileInfo()
        : ""}
    `;
  }

  private renderSelectedProfileInfo() {
    if (!this.selectedProfile) return;

    return html`
      <div
        class="mt-2 border bg-neutral-50 rounded p-2 text-sm flex justify-between"
      >
        ${this.selectedProfile.description
          ? html`<em class="text-slate-500"
              >${this.selectedProfile.description}</em
            >`
          : ""}
        <a
          href=${`${this.orgBasePath}/browser-profiles/profile/${this.selectedProfile.id}`}
          class="font-medium text-primary hover:text-indigo-500"
          target="_blank"
        >
          <span class="inline-block align-middle mr-1"
            >${msg("View profile")}</span
          >
          <sl-icon
            class="inline-block align-middle"
            name="box-arrow-up-right"
          ></sl-icon>
        </a>
      </div>
    `;
  }

  private renderNoProfiles() {
    return html`
      <div class="mx-2 text-sm text-neutral-500">
        <span class="inline-block align-middle"
          >${msg("No additional browser profiles found.")}</span
        >
        <a
          href=${`${this.orgBasePath}/browser-profiles?new`}
          class="font-medium text-primary hover:text-indigo-500"
          target="_blank"
          @click=${(e: any) => {
            const select = e.target.closest("sl-select");
            if (select) {
              select.blur();
              select.dropdown?.hide();
            }
          }}
          ><span class="inline-block align-middle"
            >${msg("Create a browser profile")}</span
          >
          <sl-icon
            class="inline-block align-middle"
            name="box-arrow-up-right"
          ></sl-icon
        ></a>
      </div>
    `;
  }

  private onChange(e: any) {
    this.selectedProfile = this.browserProfiles?.find(
      ({ id }) => id === e.target.value
    );

    this.dispatchEvent(
      new CustomEvent("on-change", {
        detail: {
          value: this.selectedProfile,
        },
      })
    );
  }

  /**
   * Fetch browser profiles and update internal state
   */
  private async fetchBrowserProfiles(): Promise<void> {
    try {
      const data = await this.getProfiles();

      this.browserProfiles = orderBy(["name", "created"])(["asc", "desc"])(
        data
      ) as Profile[];

      if (this.profileId && !this.selectedProfile) {
        this.selectedProfile = this.browserProfiles.find(
          ({ id }) => id === this.profileId
        );
      }
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve browser profiles at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getProfiles() {
    const data = await this.apiFetch<APIPaginatedList<Profile>>(
      `/orgs/${this.orgId}/profiles`,
      this.authState!
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
