import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import { Profile } from "./types";

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-detail></btrix-browser-profiles-detail>
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
          ${this.profile?.resource
            ? html`<sl-button
                type="neutral"
                size="small"
                href=${this.profile.resource.filename}
                title=${this.profile.resource.filename}
                download=${this.profile.resource.filename}
              >
                <sl-icon slot="prefix" name="download"></sl-icon>
                ${msg("Download Profile")}
              </sl-button>`
            : ""}
          ${this.profile
            ? html`<sl-button size="small">${msg("Edit Profile")}</sl-button>`
            : html`<sl-skeleton
                style="width: 6em; height: 2em;"
              ></sl-skeleton>`}
        </div>
      </header>

      <section class="rounded border p-4 md:p-8">
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
                >${msg("Base Profile")}</span
              >
              <sl-tooltip
                content=${msg(
                  "The browser profile that this profile is based off of"
                )}
                ><sl-icon
                  class="inline-block align-middle"
                  name="info-circle"
                ></sl-icon
              ></sl-tooltip>
            </dt>
            <dd>
              ${this.profile
                ? this.profile.baseId
                  ? html`<a
                      href=${`/archives/${this.profile.aid}/browser-profiles/profile/${this.profile.baseId}`}
                      @click=${this.navLink}
                      >${this.profile.baseProfileName}</a
                    >`
                  : html`<span class="text-neutral-400">${msg("None")}</span>`
                : ""}
            </dd>
          </div>
          <div class="col-span-2">
            <dt class="text-sm text-0-600">${msg("Visited URLs")}</dt>
            <dd>
              <ul>
                ${this.profile?.origins.map((url) => html`<li>${url}</li>`)}
              </ul>
            </dd>
          </div>
        </dl>
      </section>`;
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
}

customElements.define("btrix-browser-profiles-detail", BrowserProfilesDetail);
