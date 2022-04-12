import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import { Profile } from "./types";

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-list></btrix-browser-profiles-list>
 * ```
 */
@localized()
export class BrowserProfilesList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId?: string;

  @property({ type: Boolean })
  showCreateDialog = false;

  @state()
  browserProfiles?: Profile[];

  @state()
  private isCreateFormVisible = false;

  @state()
  private isSubmitting = false;

  firstUpdated() {
    if (this.showCreateDialog) {
      this.isCreateFormVisible = true;
    }

    this.fetchCrawls();
  }

  render() {
    return html`<header class="mb-3 text-right">
        <a
          href=${`/archives/${this.archiveId}/browser-profiles/new`}
          class="inline-block bg-primary hover:bg-indigo-400 text-white text-center font-medium leading-none rounded px-3 py-2 transition-colors"
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
        label=${msg(str`Create Browser Profile`)}
        ?open=${this.showCreateDialog}
        @sl-request-close=${this.hideDialog}
        @sl-show=${() => (this.isCreateFormVisible = true)}
        @sl-after-hide=${() => (this.isCreateFormVisible = false)}
      >
        ${this.isCreateFormVisible ? this.renderNew() : ""}
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
        class="block p-4 leading-none border-t first:border-t-0 transition-colors"
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

  private renderNew() {
    return html`<sl-form @sl-submit=${this.onSubmit}>
      <div class="grid gap-5">
        <sl-input
          name="name"
          label=${msg("Name")}
          help-text=${msg("You can change the browser profile name later.")}
          placeholder=${msg("Example (example.com)", {
            desc: "Example browser profile name",
          })}
          autocomplete="off"
          value="My Profile"
          required
        ></sl-input>

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
              required
            >
            </sl-input>
          </div>
        </div>

        <details>
          <summary class="text-sm text-neutral-500 font-medium cursor-pointer">
            ${msg("More options")}
          </summary>
          <div class="grid gap-5 p-3">
            <sl-select
              name="baseId"
              label=${msg("Extend Profile")}
              help-text=${msg("Extend an existing browser profile.")}
              clearable
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

            <sl-textarea
              name="description"
              label=${msg("Description")}
              help-text=${msg("Description of this browser profile.")}
              placeholder=${msg("Example (example.com) login profile", {
                desc: "Example browser profile name",
              })}
              rows="2"
              autocomplete="off"
            ></sl-textarea>
          </div>
        </details>

        <div class="text-right">
          <sl-button @click=${this.hideDialog}>${msg("Cancel")}</sl-button>
          <sl-button
            type="primary"
            submit
            ?disabled=${this.isSubmitting}
            ?loading=${this.isSubmitting}
          >
            ${msg("Create")}
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
    const params = {
      name: formData.get("name"),
      url: `${formData.get("urlPrefix")}${url.substring(url.indexOf(",") + 1)}`,
      baseId: formData.get("baseId"),
      description: formData.get("description"),
    };

    console.log(params);

    try {
      const data = await this.apiFetch(
        `/archives/${this.archiveId}/profiles/`,
        this.authState!,
        {
          method: "POST",
          body: JSON.stringify(params),
        }
      );

      console.log("data:", data);

      const { url } = await this.apiFetch(
        `/archives/${this.archiveId}/profiles/browser/${data.profile}`,
        this.authState!
      );

      console.log(url);

      this.isSubmitting = false;

      // this.navTo(
      //   `/archives/${this.archiveId}/browser-profiles/profile/browser/${data.profile}`
      // );
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        type: "danger",
        icon: "exclamation-octagon",
      });

      this.isSubmitting = false;
    }
  }

  /**
   * Fetch browser profiles and update internal state
   */
  private async fetchCrawls(): Promise<void> {
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
    if (!this.archiveId) {
      throw new Error(`Archive ID ${typeof this.archiveId}`);
    }

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
