import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-new
 *  authState=${authState}
 *  archiveId=${archiveId}
 *  browserId=${browserId}
 * ></btrix-browser-profiles-new>
 * ```
 */
@localized()
export class BrowserProfilesNew extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @property({ type: String })
  browserId!: string;

  @property({ type: Object })
  profileData: Partial<{
    name: string;
    url: string;
  }> = {};

  @state()
  browserUrl?: string;

  firstUpdated() {
    console.log(this.profileData);
    this.fetchBrowser();
  }

  render() {
    return html`
      <div class="mb-7">
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

      ${this.browserUrl
        ? this.renderBrowser()
        : html`
            <div class="flex items-center justify-center my-24 text-4xl">
              <sl-spinner></sl-spinner>
            </div>
          `}
    `;
  }

  private renderBrowser() {
    return html`
      <iframe
        id="browser-iframe"
        class="aspect-video w-full"
        src=${this.browserUrl!}
      ></iframe>
    `;
  }

  /**
   * Fetch browser profiles and update internal state
   */
  private async fetchBrowser(): Promise<void> {
    try {
      await this.checkBrowserStatus();
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  /**
   * Check whether temporary browser is up
   **/
  private async checkBrowserStatus() {
    const result = await this.getBrowser();

    if (result.detail === "waiting_for_browser") {
      window.setTimeout(() => this.checkBrowserStatus(), 5 * 1000);
    } else {
      this.browserUrl = result.url;

      this.pingBrowser();
    }
  }

  private async getBrowser(): Promise<{
    detail?: string;
    url?: string;
  }> {
    const data = await this.apiFetch(
      `/archives/${this.archiveId}/profiles/browser/${this.browserId}`,
      this.authState!
    );

    return data;
  }

  /**
   * Ping temporary browser every minute to keep it alive
   **/
  private async pingBrowser() {
    await this.apiFetch(
      `/archives/${this.archiveId}/profiles/browser/${this.browserId}/ping`,
      this.authState!,
      {
        method: "POST",
      }
    );
    console.log("pinged");
    window.setTimeout(() => this.pingBrowser(), 60 * 1000);
  }
}

customElements.define("btrix-browser-profiles-new", BrowserProfilesNew);
