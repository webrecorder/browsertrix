import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import { ref } from "lit/directives/ref.js";

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

  @state()
  private isFullscreen = false;

  private pollTimerId?: number;

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener("fullscreenchange", this.onFullscreenChange);
  }

  disconnectedCallback() {
    window.clearTimeout(this.pollTimerId);
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
  }

  firstUpdated() {
    this.fetchBrowser();
  }

  render() {
    return html`
      <div id="browserProfileInstructions" class="mb-5">
        <p class="text-sm text-neutral-500">
          ${msg(
            "Interact with the browser to record your browser profile. When you’re finished interacting, name and save the profile."
          )}
        </p>
      </div>

      <div id="interactive-browser" aria-live="polite">
        ${this.hasFetchError
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
              <div class="lg:flex bg-white">
                <div class="grow lg:rounded-l overflow-hidden">
                  ${this.browserUrl
                    ? this.renderBrowser()
                    : html`
                        <div
                          class="aspect-video bg-slate-50 flex items-center justify-center text-4xl"
                        >
                          <sl-spinner></sl-spinner>
                        </div>
                      `}
                </div>
                <div
                  class="rounded-b lg:rounded-b-none lg:rounded-r border p-2 shadow-inner"
                >
                  ${document.fullscreenEnabled
                    ? html`
                        <div class="mb-4 text-right">
                          <sl-button
                            type="neutral"
                            size="small"
                            @click=${() =>
                              this.isFullscreen
                                ? document.exitFullscreen()
                                : this.enterFullscreen("interactive-browser")}
                          >
                            ${this.isFullscreen
                              ? html`
                                  <sl-icon
                                    slot="prefix"
                                    name="fullscreen-exit"
                                    label=${msg("Exit fullscreen")}
                                  ></sl-icon>
                                  ${msg("Exit")}
                                `
                              : html`
                                  <sl-icon
                                    slot="prefix"
                                    name="arrows-fullscreen"
                                    label=${msg("Fullscreen")}
                                  ></sl-icon>
                                  ${msg("Go Fullscreen")}
                                `}
                          </sl-button>
                        </div>
                      `
                    : ""}

                  <div class="p-2">${this.renderForm()}</div>
                </div>
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
          ?disabled=${!this.browserUrl}
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
          ?disabled=${!this.browserUrl}
        ></sl-textarea>

        <div class="text-right">
          <sl-button
            type="primary"
            submit
            ?disabled=${!this.browserUrl || this.isSubmitting}
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
      <iframe
        class="w-full ${this.isFullscreen ? "h-screen" : "aspect-video"}"
        title=${msg("Interactive browser for creating browser profile")}
        src=${this.browserUrl!}
        ${ref((el) => this.onIframeRef(el as HTMLIFrameElement))}
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

    if (this.isFullscreen) {
      await document.exitFullscreen();
    }

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

      this.notify({
        message: msg("Successfully created browser profile."),
        type: "success",
        icon: "check2-circle",
      });

      // TODO nav to detail page
      // this.navTo(
      //   `/archives/${this.archiveId}/browser-profiles/profile/${data.id}`
      // );
      this.navTo(`/archives/${this.archiveId}/browser-profiles`);
    } catch (e) {
      this.isSubmitting = false;

      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private onIframeRef(el: HTMLIFrameElement) {
    el.addEventListener("load", () => {
      // TODO see if we can make this work locally without CORs errors
      el.contentWindow?.localStorage.setItem("uiTheme", '"default"');
      el.contentWindow?.localStorage.setItem(
        "InspectorView.screencastSplitViewState",
        '{"vertical":{"size":241}}'
      );
    });
  }

  /**
   * Enter fullscreen mode
   * @param id ID of element to fullscreen
   */
  private async enterFullscreen(id: string) {
    try {
      document.getElementById(id)!.requestFullscreen({
        // Show browser navigation controls
        navigationUI: "show",
      });
    } catch (err) {
      console.error(err);
    }
  }

  private onFullscreenChange = () => {
    if (document.fullscreenElement) {
      this.isFullscreen = true;
    } else {
      this.isFullscreen = false;
    }
  };
}

customElements.define("btrix-browser-profiles-new", BrowserProfilesNew);
