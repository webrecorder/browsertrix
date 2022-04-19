import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
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
            ? html` <sl-button
                size="small"
                @click=${() => (this.showCreateDialog = true)}
              >
                ${msg("Edit Browser Profile")}</sl-button
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
        <h3 class="text-lg font-medium mb-2">${msg("Preview Profile")}</h3>
        <div class="lg:flex bg-white relative">
          <div class="grow lg:rounded-lg border overflow-hidden">
            <btrix-profile-browser></btrix-profile-browser>
          </div>
          <div
            class="rounded-b lg:rounded-b-none lg:rounded-r border w-72 bg-white absolute h-full right-0"
          >
            ${this.renderOrigins()}
          </div>
        </div>
      </section>

      <sl-dialog
        label=${msg(str`Edit Browser Profile`)}
        ?open=${this.showCreateDialog}
        @sl-request-close=${this.hideDialog}
        @sl-show=${() => (this.isCreateFormVisible = true)}
        @sl-after-hide=${() => (this.isCreateFormVisible = false)}
      >
        <div class="mb-4">
          ${this.isBrowserCompatible
            ? ""
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
          label=${msg("Starting URL")}
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
            ${msg("Start Editing")}
          </sl-button>
        </div>
      </div>
    </sl-form>`;
  }

  private renderOrigins() {
    return html`
      <div role="table">
        <div class="leading-tight p-2 border-b" role="rowgroup">
          <div
            class="flex items-center justify-between text-xs text-neutral-500"
            role="row"
          >
            <div role="columnheader" aria-sort="none">
              ${msg("Visited URLs")}
            </div>
            <div role="columnheader" aria-sort="none">
              <span class="inline-block align-middle">${msg("Preview")}</span>

              <sl-tooltip
                content=${msg(
                  "Preview browser profile starting from the specified URL"
                )}
                ><sl-icon
                  class="inline-block align-middle"
                  name="info-circle"
                ></sl-icon
              ></sl-tooltip>
            </div>
          </div>
        </div>
        <div role="rowgroup">
          ${this.profile?.origins.map(
            (url) => html`
              <div
                class="flex items-center justify-between border-t first:border-t-0 border-t-neutral-100 hover:bg-slate-50"
                role="row"
              >
                <div class="text-sm truncate w-full px-2" role="cell">
                  ${url}
                </div>
                <div role="cell">
                  <sl-icon-button
                    name="play-btn"
                    class="text-xl"
                    ?disabled=${!this.isBrowserCompatible || this.isSubmitting}
                    @click=${() => this.launchBrowser(url)}
                  ></sl-icon-button>
                </div>
              </div>
            `
          )}
        </div>
      </div>
    `;
  }

  private hideDialog() {
    this.showCreateDialog = false;
  }

  /**
   * @param navigateStartUrl URL to launch preview from--
   *                         different than starting URL, which will
   *                         override the profile start url
   */
  private async launchBrowser(navigateStartUrl?: string) {
    if (!this.profile) return;

    this.isSubmitting = true;

    const url = this.profile.origins[0];

    try {
      const data = await this.createBrowser({ url });

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
        )}&profileId=${window.encodeURIComponent(
          this.profile.id
        )}&navigateUrl=${window.encodeURIComponent(
          navigateStartUrl && navigateStartUrl !== url ? navigateStartUrl : ""
        )}`
      );
    } catch (e) {
      this.isSubmitting = false;

      this.notify({
        message: msg("Sorry, couldn't start browser at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  async onSubmit(event: { detail: { formData: FormData } }) {
    if (!this.profile) return;

    this.isSubmitting = true;

    const { formData } = event.detail;
    const url = formData.get("url") as string;

    try {
      const data = await this.createBrowser({ url });

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
        )}&profileId=${window.encodeURIComponent(this.profile.id)}&navigateUrl=`
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
