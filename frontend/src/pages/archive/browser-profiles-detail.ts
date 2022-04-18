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

  @property({ type: Boolean })
  showCreateDialog = false;

  @state()
  private isCreateFormVisible = false;

  @state()
  private isSubmitting = false;

  /** Profile creation only works in Chromium-based browsers */
  private isBrowserCompatible = Boolean((window as any).chrome);

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
            ? html`<sl-button
                type="primary"
                size="small"
                @click=${() => (this.showCreateDialog = true)}
                ><sl-icon slot="prefix" name="collection-play-fill"></sl-icon>
                ${msg("Launch Browser Profile")}</sl-button
              >`
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
      </section>

      <sl-dialog
        label=${msg(str`View & Edit Browser Profile`)}
        ?open=${this.showCreateDialog}
        @sl-request-close=${this.hideDialog}
        @sl-show=${() => (this.isCreateFormVisible = true)}
        @sl-after-hide=${() => (this.isCreateFormVisible = false)}
      >
        <div class="mb-4">
          ${this.isBrowserCompatible
            ? html`
                <btrix-alert type="info" class="text-sm">
                  ${msg(
                    "Saving any edits after starting the browser will create a new version of this profile."
                  )}
                </btrix-alert>
              `
            : html`
                <btrix-alert type="warning" class="text-sm">
                  ${msg(
                    "Browser profile creation is only supported in Chromium-based browsers (such as Chrome) at this time. Please re-open this page in a compatible browser to proceed."
                  )}
                </btrix-alert>
              `}
        </div>
        ${this.isCreateFormVisible ? this.renderCreateForm() : ""}
      </sl-dialog> `;
  }

  private renderCreateForm() {
    return html`<sl-form @sl-submit=${this.onSubmit}>
      <div class="grid gap-5">
        <sl-select
          name="url"
          value=${this.profile?.origins[0] || ""}
          required
          hoist
          ?disabled=${!this.isBrowserCompatible}
          @sl-hide=${this.stopProp}
          @sl-after-hide=${this.stopProp}
        >
          ${this.profile?.origins.map(
            (origin) => html`
              <sl-menu-item value=${origin}>${origin}</sl-menu-item>
            `
          )}
        </sl-select>

        <div class="text-right">
          <sl-button @click=${this.hideDialog}>${msg("Cancel")}</sl-button>
          <sl-button
            type="primary"
            submit
            ?disabled=${!this.isBrowserCompatible || this.isSubmitting}
            ?loading=${this.isSubmitting}
          >
            ${msg("Start Browser")}
          </sl-button>
        </div>
      </div>
    </sl-form>`;
  }

  private hideDialog() {
    this.showCreateDialog = false;
  }

  async onSubmit(event: { detail: { formData: FormData } }) {
    if (!this.profile) return;

    this.isSubmitting = true;

    const { formData } = event.detail;
    const url = formData.get("url") as string;
    const params = {
      url,
      baseId: this.profile.id,
    };

    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/profiles/browser`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify(params),
        }
      );

      this.notify({
        message: msg("Starting up browser."),
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
        )}&baseId=${window.encodeURIComponent(this.profile.id)}`
      );
    } catch (e) {
      this.isSubmitting = false;

      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
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
