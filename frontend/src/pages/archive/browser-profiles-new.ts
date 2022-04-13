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

  @state()
  browserUrl?: string;

  firstUpdated() {
    window.scrollTo({ top: 150 });
    this.fetchBrowser();
  }

  render() {
    return html`
      <div class="mb-5">
        <p class="text-sm text-neutral-500 mb-5">
          ${msg(
            "Interact with the browser to record your browser profile. When you’re finished interacting, name and save the profile."
          )}
        </p>
      </div>

      ${this.browserUrl
        ? this.renderInteractiveBrowser()
        : html`
            <div
              class="aspect-video bg-slate-50 flex items-center justify-center text-4xl"
            >
              <sl-spinner></sl-spinner>
            </div>
          `}

      <div class="rounded-b-lg border p-4">${this.renderForm()}</div>
    `;
  }

  private renderForm() {
    return html`<sl-form @sl-submit=${console.log}>
      <div class="grid gap-5">
        <sl-input
          name="name"
          label=${msg("Name")}
          placeholder=${msg("Example (example.com)", {
            desc: "Example browser profile name",
          })}
          autocomplete="off"
          value="My Profile"
          required
        ></sl-input>

        <sl-textarea
          name="description"
          label=${msg("Description")}
          placeholder=${msg("Example (example.com) login profile", {
            desc: "Example browser profile name",
          })}
          rows="2"
          autocomplete="off"
        ></sl-textarea>

        <div class="text-right">
          <sl-button type="primary" submit> ${msg("Save Profile")} </sl-button>
        </div>
      </div>
    </sl-form>`;
  }

  private renderInteractiveBrowser() {
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
