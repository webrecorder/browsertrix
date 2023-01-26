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
 *  orgId=${orgId}
 * ></btrix-browser-profiles-list>
 * ```
 */
@localized()
export class BrowserProfilesList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

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

    this.fetchBrowserProfiles();
  }

  render() {
    return html`<header class="mb-3 text-right">
        <sl-button
          href=${`/orgs/${this.orgId}/browser-profiles?new`}
          variant="primary"
          @click=${this.navLink}
        >
          <sl-icon slot="prefix" name="plus-lg"></sl-icon>
          ${msg("New Browser Profile")}
        </sl-button>
      </header>

      ${this.renderTable()}

      <sl-dialog
        label=${msg(str`New Browser Profile`)}
        ?open=${this.showCreateDialog}
        @sl-request-close=${this.hideDialog}
        @sl-show=${() => (this.isCreateFormVisible = true)}
        @sl-after-hide=${() => (this.isCreateFormVisible = false)}
      >
        ${this.isCreateFormVisible ? this.renderCreateForm() : ""}
      </sl-dialog> `;
  }

  private renderTable() {
    return html`
      <div role="table">
        <div class="mb-2 px-1" role="rowgroup">
          <div
            class="hidden md:grid grid-cols-8 gap-3 md:gap-5 text-sm text-neutral-500"
            role="row"
          >
            <div class="col-span-3 px-2" role="columnheader" aria-sort="none">
              ${msg("Description")}
            </div>
            <div class="col-span-1 px-2" role="columnheader" aria-sort="none">
              ${msg("Created")}
            </div>
            <div class="col-span-2 px-2" role="columnheader" aria-sort="none">
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
        class="block p-1 leading-none hover:bg-zinc-50 hover:text-primary border-t first:border-t-0 transition-colors"
        href=${`/orgs/${this.orgId}/browser-profiles/profile/${data.id}`}
        @click=${this.navLink}
        title=${data.name}
      >
        <div class="grid grid-cols-8 gap-3 md:gap-5" role="row">
          <div class="col-span-8 md:col-span-3 p-2" role="cell">
            <div class="font-medium mb-1">${data.name}</div>
            <div class="text-sm truncate" title=${data.description}>
              ${data.description}
            </div>
          </div>
          <div class="col-span-8 md:col-span-1 p-2 text-sm" role="cell">
            ${new Date(data.created).toLocaleDateString()}
          </div>
          <div class="col-span-7 md:col-span-3 p-2 text-sm" role="cell">
            ${data.origins.join(", ")}
          </div>
          <div class="col-span-1 md:col-span-1 flex items-center justify-end">
            ${this.renderMenu(data)}
          </div>
        </div>
      </a>
    `;
  }

  private renderMenu(data: Profile) {
    return html`
      <sl-dropdown @click=${(e: Event) => e.preventDefault()}>
        <sl-icon-button
          slot="trigger"
          name="three-dots"
          label=${msg("More")}
          style="font-size: 1rem"
        ></sl-icon-button>
        <ul
          class="text-sm text-neutral-800 bg-white whitespace-nowrap"
          role="menu"
        >
          <li
            class="p-2 hover:bg-zinc-100 cursor-pointer"
            role="menuitem"
            @click=${(e: any) => {
              this.duplicateProfile(data);
              e.target.closest("sl-dropdown").hide();
            }}
          >
            <sl-icon
              class="inline-block align-middle px-1"
              name="files"
            ></sl-icon>
            <span class="inline-block align-middle pr-2"
              >${msg("Duplicate profile")}</span
            >
          </li>
          <li
            class="p-2 text-danger hover:bg-danger hover:text-white cursor-pointer"
            role="menuitem"
            @click=${(e: any) => {
              // Close dropdown before deleting template
              e.target.closest("sl-dropdown").hide();

              this.deleteProfile(data);
            }}
          >
            <sl-icon
              class="inline-block align-middle px-1"
              name="file-earmark-x"
            ></sl-icon>
            <span class="inline-block align-middle pr-2">${msg("Delete")}</span>
          </li>
        </ul>
      </sl-dropdown>
    `;
  }

  private renderCreateForm() {
    return html`<form @submit=${this.onSubmit}>
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

        <div class="text-right">
          <sl-button @click=${this.hideDialog}>${msg("Cancel")}</sl-button>
          <sl-button
            variant="primary"
            type="submit"
            ?disabled=${this.isSubmitting}
            ?loading=${this.isSubmitting}
          >
            ${msg("Start Profile Creator")}
          </sl-button>
        </div>
      </div>
    </form>`;
  }

  private hideDialog() {
    this.navTo(`/orgs/${this.orgId}/browser-profiles`);
  }

  async onSubmit(event: SubmitEvent) {
    event.preventDefault();
    this.isSubmitting = true;

    const formData = new FormData(event.target as HTMLFormElement);
    const url = formData.get("url") as string;

    try {
      const data = await this.createBrowser({
        url: `${formData.get("urlPrefix")}${url.substring(
          url.indexOf(",") + 1
        )}`,
      });

      this.notify({
        message: msg("Starting up browser for profile creation."),
        variant: "success",
        icon: "check2-circle",
      });

      this.navTo(
        `/orgs/${this.orgId}/browser-profiles/profile/browser/${
          data.browserid
        }?name=${window.encodeURIComponent(
          "My Profile"
        )}&description=&profileId=`
      );
    } catch (e) {
      this.isSubmitting = false;

      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async duplicateProfile(profile: Profile) {
    const url = profile.origins[0];

    try {
      const data = await this.createBrowser({ url });

      this.notify({
        message: msg("Starting up browser with selected profile..."),
        variant: "success",
        icon: "check2-circle",
      });

      this.navTo(
        `/orgs/${this.orgId}/browser-profiles/profile/browser/${
          data.browserid
        }?name=${window.encodeURIComponent(
          profile.name
        )}&description=${window.encodeURIComponent(
          profile.description || ""
        )}&profileId=${window.encodeURIComponent(profile.id)}&navigateUrl=`
      );
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async deleteProfile(profile: Profile) {
    try {
      const data = await this.apiFetch(
        `/orgs/${this.orgId}/profiles/${profile.id}`,
        this.authState!,
        {
          method: "DELETE",
        }
      );

      if (data.error && data.crawlconfigs) {
        this.notify({
          message: msg(
            html`Could not delete <strong>${profile.name}</strong>, in use by
              <strong
                >${data.crawlconfigs
                  .map(({ name }: any) => name)
                  .join(", ")}</strong
              >. Please remove browser profile from crawl config to continue.`
          ),
          variant: "warning",
          icon: "exclamation-triangle",
          duration: 15000,
        });
      } else {
        this.notify({
          message: msg(html`Deleted <strong>${profile.name}</strong>.`),
          variant: "success",
          icon: "check2-circle",
        });

        this.browserProfiles = this.browserProfiles!.filter(
          (p) => p.id !== profile.id
        );
      }
    } catch (e) {
      this.notify({
        message: msg("Sorry, couldn't delete browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private createBrowser({ url }: { url: string }) {
    const params = {
      url,
    };

    return this.apiFetch(
      `/orgs/${this.orgId}/profiles/browser`,
      this.authState!,
      {
        method: "POST",
        body: JSON.stringify(params),
      }
    );
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
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async getProfiles(): Promise<Profile[]> {
    const data = await this.apiFetch(
      `/orgs/${this.orgId}/profiles`,
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
