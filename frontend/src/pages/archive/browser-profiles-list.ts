import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import type { Profile } from "./types";

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-list
 *  authState=${authState}
 *  archiveId=${archiveId}
 * ></btrix-browser-profiles-list>
 * ```
 */
@localized()
export class BrowserProfilesList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @property({ type: Boolean })
  showCreateDialog = false;

  @state()
  browserProfiles?: Profile[];

  @state()
  private isCreateFormVisible = false;

  @state()
  private isSubmitting = false;

  /** Profile creation only works in Chromium-based browsers */
  private isBrowserCompatible = Boolean((window as any).chrome);

  firstUpdated() {
    if (this.showCreateDialog) {
      this.isCreateFormVisible = true;
    }

    this.fetchBrowserProfiles();
  }

  render() {
    return html`<header class="mb-3 text-right">
        <a
          href=${`/archives/${this.archiveId}/browser-profiles/new`}
          class="inline-block bg-indigo-500 hover:bg-indigo-400 text-white text-center font-medium leading-none rounded px-3 py-2 transition-colors"
          role="button"
          @click=${this.navLink}
        >
          <sl-icon
            class="inline-block align-middle mr-2"
            name="plus-lg"
          ></sl-icon
          ><span class="inline-block align-middle mr-2 text-sm"
            >${msg("New Browser Profile")}</span
          >
        </a>
      </header>

      ${this.renderTable()}

      <sl-dialog
        label=${msg(str`New Browser Profile`)}
        ?open=${this.showCreateDialog}
        @sl-request-close=${this.hideDialog}
        @sl-show=${() => (this.isCreateFormVisible = true)}
        @sl-after-hide=${() => (this.isCreateFormVisible = false)}
      >
        ${this.isBrowserCompatible
          ? ""
          : html`
              <div class="mb-4">
                <btrix-alert type="warning" class="text-sm">
                  ${msg(
                    "Browser profile creation is only supported in Chromium-based browsers (such as Chrome) at this time. Please re-open this page in a compatible browser to proceed."
                  )}
                </btrix-alert>
              </div>
            `}
        ${this.isCreateFormVisible ? this.renderCreateForm() : ""}
      </sl-dialog> `;
  }

  private renderTable() {
    return html`
      <div role="table">
        <div class="mb-2 px-4" role="rowgroup">
          <div
            class="hidden md:grid grid-cols-7 gap-3 md:gap-5 text-sm text-neutral-500"
            role="row"
          >
            <div class="col-span-3" role="columnheader" aria-sort="none">
              ${msg("Description")}
            </div>
            <div class="col-span-1" role="columnheader" aria-sort="none">
              ${msg("Created")}
            </div>
            <div class="col-span-3" role="columnheader" aria-sort="none">
              ${msg("Visited URLs")}
            </div>
          </div>
        </div>
        ${this.browserProfiles
          ? this.browserProfiles.length
            ? html`<div class="border rounded" role="rowgroup">
                ${this.browserProfiles.map(this.renderItem.bind(this))}
              </div>`
            : html`
                <div class="border-t border-b py-5">
                  <p class="text-center text-0-500">
                    ${msg("No browser profiles yet.")}
                  </p>
                </div>
              `
          : ""}
      </div>
    `;
  }

  private renderItem(data: Profile) {
    return html`
      <a
        class="block p-4 leading-none hover:bg-zinc-50 hover:text-primary border-t first:border-t-0 transition-colors"
        href=${`/archives/${this.archiveId}/browser-profiles/profile/${data.id}`}
        @click=${this.navLink}
        title=${data.name}
      >
        <div class="grid grid-cols-7 gap-3 md:gap-5" role="row">
          <div class="col-span-7 md:col-span-3" role="cell">
            <div class="font-medium mb-1">${data.name}</div>
            <div class="text-sm truncate" title=${data.description}>
              ${data.description}
            </div>
          </div>
          <div class="col-span-7 md:col-span-1 text-sm" role="cell">
            ${new Date(data.created).toLocaleDateString()}
          </div>
          <div class="col-span-7 md:col-span-3 text-sm" role="cell">
            ${data.origins.join(", ")}
          </div>
        </div>
      </a>
    `;
  }

  private renderCreateForm() {
    return html`<sl-form @sl-submit=${this.onSubmit}>
      <div class="grid gap-5">
        <div>
          <label
            id="startingUrlLabel"
            class="text-sm leading-normal"
            style="margin-bottom: var(--sl-spacing-3x-small)"
            >${msg("Starting URL")}
          </label>

          <div class="flex">
            <sl-select
              class="grow-0 mr-1"
              name="urlPrefix"
              value="https://"
              hoist
              ?disabled=${!this.isBrowserCompatible}
              @sl-hide=${this.stopProp}
              @sl-after-hide=${this.stopProp}
            >
              <sl-menu-item value="http://">http://</sl-menu-item>
              <sl-menu-item value="https://">https://</sl-menu-item>
            </sl-select>
            <sl-input
              class="grow"
              name="url"
              placeholder=${msg("example.com")}
              autocomplete="off"
              aria-labelledby="startingUrlLabel"
              ?disabled=${!this.isBrowserCompatible}
              required
            >
            </sl-input>
          </div>
        </div>

        <details>
          <summary class="text-sm text-neutral-500 font-medium cursor-pointer">
            ${msg("More options")}
          </summary>

          <div class="p-3">
            <sl-select
              name="profileId"
              label=${msg("Extend Profile")}
              help-text=${msg("Extend an existing browser profile.")}
              clearable
              ?disabled=${!this.isBrowserCompatible}
              @sl-hide=${this.stopProp}
              @sl-after-hide=${this.stopProp}
            >
              ${this.browserProfiles?.map(
                (profile) => html`
                  <sl-menu-item value=${profile.id}
                    >${profile.name}</sl-menu-item
                  >
                `
              )}
            </sl-select>
          </div>
        </details>

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
    this.navTo(`/archives/${this.archiveId}/browser-profiles`);
  }

  async onSubmit(event: { detail: { formData: FormData } }) {
    this.isSubmitting = true;

    const { formData } = event.detail;
    const url = formData.get("url") as string;
    const profileId = formData.get("profileId") as string;
    const params: {
      url: string;
      profileId?: string;
    } = {
      url: `${formData.get("urlPrefix")}${url.substring(url.indexOf(",") + 1)}`,
    };

    if (profileId) {
      params.profileId = profileId;
    }

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
        message: msg("Starting up browser for profile creation."),
        type: "success",
        icon: "check2-circle",
      });

      this.navTo(
        `/archives/${this.archiveId}/browser-profiles/profile/browser/${
          data.browserid
        }?name=${window.encodeURIComponent(
          "My Profile"
        )}&description=&profileId=`
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
   * Fetch browser profiles and update internal state
   */
  private async fetchBrowserProfiles(): Promise<void> {
    try {
      const data = await this.getProfiles();

      this.browserProfiles = data;
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't retrieve browser profiles at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getProfiles(): Promise<Profile[]> {
    const data = await this.apiFetch(
      `/archives/${this.archiveId}/profiles`,
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

customElements.define("btrix-browser-profiles-list", BrowserProfilesList);
