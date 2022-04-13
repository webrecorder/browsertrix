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
  private browserUrl?: string;

  @state()
  private isSubmitting = false;

  @state()
  private hasFetchError = false;

  private pollTimerId?: number;

  disconnectedCallback() {
    window.clearTimeout(this.pollTimerId);
  }

  firstUpdated() {
    // Scroll down to full view
    const { top } = this.getBoundingClientRect();
    window.scrollTo({ top: top - 20, left: 0, behavior: "smooth" });

    this.fetchBrowser();
  }

  render() {
    return html`
      <div id="browserProfileInstructions" class="mb-5">
        <p class="text-sm text-neutral-500 mb-5">
          ${msg(
            "Interact with the browser to record your browser profile. When you’re finished interacting, name and save the profile."
          )}
        </p>
      </div>

      <div aria-live="polite">
        ${this.browserUrl
          ? html`
              ${this.renderBrowser()}
              <div class="rounded-b-lg border p-4">${this.renderForm()}</div>
            `
          : this.hasFetchError
          ? html`
              <btrix-alert type="danger">
                ${msg(
                  html`The interactive browser is not available. Try creating a
                    new browser profile.
                    <a
                      class="font-medium underline"
                      href=${`/archives/${this.archiveId}/browser-profiles/new`}
                      @click=${this.navLink}
                      >Create New</a
                    >`
                )}
              </btrix-alert>
            `
          : html`
              <div
                class="aspect-video bg-slate-50 flex items-center justify-center text-4xl"
              >
                <sl-spinner></sl-spinner>
              </div>
            `}
      </div>
    `;
  }

  private renderForm() {
    return html`<sl-form @sl-submit=${this.onSubmit}>
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
          help-text=${msg("Optional profile description")}
          placeholder=${msg("Example (example.com) login profile", {
            desc: "Example browser profile name",
          })}
          rows="2"
          autocomplete="off"
        ></sl-textarea>

        <div class="text-right">
          <sl-button
            type="primary"
            submit
            ?disabled=${this.isSubmitting}
            ?loading=${this.isSubmitting}
          >
            ${msg("Save Profile")}
          </sl-button>
        </div>
      </div>
    </sl-form>`;
  }

  private renderBrowser() {
    return html`
      <iframe class="aspect-video w-full" src=${this.browserUrl!}></iframe>
    `;
  }

  /**
   * Fetch browser profiles and update internal state
   */
  private async fetchBrowser(): Promise<void> {
    try {
      await this.checkBrowserStatus();
    } catch (e) {
      this.hasFetchError = true;

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
      this.pollTimerId = window.setTimeout(
        () => this.checkBrowserStatus(),
        5 * 1000
      );
    } else if (result.url) {
      this.browserUrl = result.url;

      this.pingBrowser();
    } else {
      console.debug("Unknown checkBrowserStatus state");
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

    this.pollTimerId = window.setTimeout(() => this.pingBrowser(), 60 * 1000);
  }

  private async onSubmit(event: { detail: { formData: FormData } }) {
    this.isSubmitting = true;

    const { formData } = event.detail;
    const params = {
      name: formData.get("name"),
      description: formData.get("description"),
    };

    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/profiles/browser/${this.browserId}/commit`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify(params),
        }
      );

      console.log(data);

      this.notify({
        message: msg("Successfully created browser profile."),
        type: "success",
        icon: "check2-circle",
      });

      this.navTo(
        `/archives/${this.archiveId}/browser-profiles/profile/${data.id}`
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
}

customElements.define("btrix-browser-profiles-new", BrowserProfilesNew);
