import { state, property } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import { ProfileBrowser } from "../../components/profile-browser";
import { Profile } from "./types";

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-detail
 *  authState=${authState}
 *  archiveId=${archiveId}
 *  profileId=${profileId}
 * ></btrix-browser-profiles-detail>
 * ```
 */
@localized()
export class BrowserProfilesDetail extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @property({ type: String })
  profileId!: string;

  @state()
  private profile?: Profile;

  @state()
  private isLoading = false;

  @state()
  private isSubmitting = false;

  @state()
  private showSaveButton = false;

  @state()
  private browserId?: string;

  private showSaveButtonTimerId?: number;

  disconnectedCallback() {
    window.clearTimeout(this.showSaveButtonTimerId);
  }

  firstUpdated() {
    this.fetchProfile();
  }

  render() {
    return html`<div class="mb-7">
        <a
          class="text-neutral-500 hover:text-neutral-600 text-sm font-medium"
          href=${`/archives/${this.archiveId}/browser-profiles`}
          @click=${this.navLink}
        >
          <sl-icon
            name="arrow-left"
            class="inline-block align-middle"
          ></sl-icon>
          <span class="inline-block align-middle"
            >${msg("Back to Browser Profiles")}</span
          >
        </a>
      </div>

      <header class="md:flex items-center justify-between mb-3">
        <h2 class="text-xl md:text-3xl font-bold md:h-9 mb-1">
          ${this.profile?.name ||
          html`<sl-skeleton class="md:h-9 w-80"></sl-skeleton>`}
        </h2>
        <div>
          ${this.profile
            ? html` <sl-button
                size="small"
                @click=${() => this.duplicateProfile()}
              >
                ${msg("Duplicate Profile")}</sl-button
              >`
            : html`<sl-skeleton
                style="width: 6em; height: 2em;"
              ></sl-skeleton>`}
        </div>
      </header>

      <section class="rounded border p-4 mb-5">
        <dl class="grid grid-cols-2 gap-5">
          <div class="col-span-2 md:col-span-1">
            <dt class="text-sm text-0-600">${msg("Description")}</dt>
            <dd>
              ${this.profile
                ? this.profile.description ||
                  html`<span class="text-neutral-400">${msg("None")}</span>`
                : ""}
            </dd>
          </div>
          <div class="col-span-2 md:col-span-1">
            <dt class="text-sm text-0-600">
              <span class="inline-block align-middle"
                >${msg("Created at")}</span
              >
            </dt>
            <dd>
              ${this.profile
                ? html`
                    <sl-format-date
                      date=${`${this.profile.created}Z` /** Z for UTC */}
                      month="2-digit"
                      day="2-digit"
                      year="2-digit"
                      hour="numeric"
                      minute="numeric"
                      time-zone-name="short"
                    ></sl-format-date>
                  `
                : ""}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <header>
          <h3 class="text-lg font-medium mb-2">
            ${msg("Browser Profile Editor")}
          </h3>
        </header>

        <main class="relative">
          <btrix-profile-browser
            .authState=${this.authState}
            archiveId=${this.archiveId}
            browserId=${ifDefined(this.browserId)}
            .origins=${this.profile?.origins}
          ></btrix-profile-browser>

          ${this.browserId && !this.isLoading
            ? html`
                <!-- Hide browser area with overlay -->
                <!-- TODO remove when browser no longer shows dev tools -->
                ${this.isSubmitting
                  ? html`<div
                      class="absolute top-0 left-0 h-full flex items-center justify-center text-4xl bg-slate-50 lg:rounded-l-lg border border-r-0"
                      style="right: ${ProfileBrowser.SIDE_BAR_WIDTH}px;"
                    >
                      <sl-spinner></sl-spinner>
                    </div>`
                  : ""}
                ${this.showSaveButton
                  ? html`<div
                      class="absolute top-0 p-2"
                      style="right: ${ProfileBrowser.SIDE_BAR_WIDTH}px;"
                    >
                      <sl-button
                        class="shadow"
                        type="primary"
                        size="small"
                        @click=${this.saveProfile}
                        >${msg("Done Editing")}</sl-button
                      >
                    </div>`
                  : ""}
              `
            : html`
                <div
                  class="absolute top-0 left-0 h-full flex flex-col items-center justify-center"
                  style="right: ${ProfileBrowser.SIDE_BAR_WIDTH}px;"
                >
                  <p class="mb-4 text-neutral-600 max-w-prose">
                    ${msg(
                      "Load browser profile to view or edit websites in the profile."
                    )}
                  </p>
                  <sl-button
                    type="primary"
                    outline
                    ?disabled=${this.isLoading}
                    ?loading=${this.isLoading}
                    @click=${this.startBrowserPreview}
                    ><sl-icon
                      slot="prefix"
                      name="collection-play-fill"
                    ></sl-icon>
                    ${msg("Load Browser Profile")}</sl-button
                  >
                </div>
              `}
        </main>
      </section>`;
  }

  private async startBrowserPreview() {
    if (!this.profile) return;

    this.isLoading = true;

    const url = this.profile.origins[0];

    try {
      const data = await this.createBrowser({ url });

      this.notify({
        message: msg("Starting up browser..."),
        type: "success",
        icon: "check2-circle",
      });

      this.browserId = data.browserid;

      // Slightly delay showing the save button while browser loads
      this.showSaveButtonTimerId = window.setTimeout(() => {
        this.showSaveButton = true;
      }, 3 * 1000);
    } catch (e) {
      this.isLoading = false;

      this.notify({
        message: msg("Sorry, couldn't preview browser profile at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }

    this.isLoading = false;
  }

  private async duplicateProfile() {
    if (!this.profile) return;

    this.isLoading = true;

    const url = this.profile.origins[0];

    try {
      const data = await this.createBrowser({ url });

      this.notify({
        message: msg("Starting up browser with current profile..."),
        type: "success",
        icon: "check2-circle",
      });

      this.navTo(
        `/archives/${this.archiveId}/browser-profiles/profile/browser/${
          data.browserid
        }?name=${window.encodeURIComponent(
          this.profile.name
        )}&description=${window.encodeURIComponent(
          this.profile.description || ""
        )}&profileId=${window.encodeURIComponent(this.profile.id)}&navigateUrl=`
      );
    } catch (e) {
      this.isLoading = false;

      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private createBrowser({ url }: { url: string }) {
    const params = {
      url,
      profileId: this.profile!.id,
    };

    return this.apiFetch(
      `/archives/${this.archiveId}/profiles/browser`,
      this.authState!,
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    );
  }

  /**
   * Fetch browser profile and update internal state
   */
  private async fetchProfile(): Promise<void> {
    try {
      const data = await this.getProfile();

      this.profile = data;
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve browser profiles at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getProfile(): Promise<Profile> {
    const data = await this.apiFetch(
      `/archives/${this.archiveId}/profiles/${this.profileId}`,
      this.authState!
    );

    return data;
  }

  private async saveProfile() {
    if (!this.browserId) return;

    if (
      !window.confirm(
        msg(
          "Save browser changes to profile? You will need to reload the editor to make additional changes."
        )
      )
    ) {
      return;
    }

    this.isSubmitting = true;
    this.showSaveButton = false;

    const params = {
      name: this.profile!.name,
      browserid: this.browserId,
    };

    try {
      await this.apiFetch(
        `/archives/${this.archiveId}/profiles/${this.profileId}`,
        this.authState!,
        {
          method: "PATCH",
          body: JSON.stringify(params),
        }
      );

      this.notify({
        message: msg("Successfully saved browser profile."),
        type: "success",
        icon: "check2-circle",
      });

      this.browserId = undefined;
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't save browser profile at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });

      this.showSaveButton = true;
    }

    this.isSubmitting = false;
  }

  /**
   * Stop propgation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: CustomEvent) {
    e.stopPropagation();
  }
}

customElements.define("btrix-browser-profiles-detail", BrowserProfilesDetail);
