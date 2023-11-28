import { state, property, customElement } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";
import { when } from "lit/directives/when.js";

import type { AuthState } from "@/utils/AuthService";
import LiteElement, { html } from "@/utils/LiteElement";
import type { Profile } from "./types";
import type { APIPaginatedList } from "@/types/api";
import type { SelectNewDialogEvent } from "./index";
import type { Browser } from "@/types/browser";

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
@customElement("btrix-browser-profiles-list")
export class BrowserProfilesList extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  orgId!: string;

  @state()
  browserProfiles?: Profile[];

  firstUpdated() {
    this.fetchBrowserProfiles();
  }

  render() {
    return html`<header>
        <div class="flex justify-between w-full h-8 mb-4">
          <h1 class="text-xl font-semibold">${msg("Browser Profiles")}</h1>
          <sl-button
            variant="primary"
            size="small"
            @click=${() => {
              this.dispatchEvent(
                <SelectNewDialogEvent>new CustomEvent("select-new-dialog", {
                  detail: "browser-profile",
                })
              );
            }}
          >
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            ${msg("New Browser Profile")}
          </sl-button>
        </div>
      </header>

      ${this.renderTable()}`;
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
        href=${`${this.orgBasePath}/browser-profiles/profile/${data.id}`}
        @click=${this.navLink}
        title=${data.name}
      >
        <div class="grid grid-cols-8 gap-3 md:gap-5" role="row">
          <div class="col-span-8 md:col-span-3 p-2" role="cell">
            <div class="font-medium text-sm">
              <span>${data.name}</span>
              ${when(
                data.resource && data.resource.replicas.length > 0,
                () => html` <sl-tooltip content=${msg("Backed up")}>
                  <sl-icon
                    name="clouds"
                    class="w-4 h-4 ml-2 align-text-bottom text-success"
                  ></sl-icon>
                </sl-tooltip>`
              )}
            </div>
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
      <sl-dropdown hoist @click=${(e: Event) => e.preventDefault()}>
        <sl-icon-button
          slot="trigger"
          name="three-dots"
          label=${msg("Actions")}
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
              name="trash3"
            ></sl-icon>
            <span class="inline-block align-middle pr-2">${msg("Delete")}</span>
          </li>
        </ul>
      </sl-dropdown>
    `;
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
        `${this.orgBasePath}/browser-profiles/profile/browser/${
          data.browserid
        }?name=${window.encodeURIComponent(
          profile.name
        )}&description=${window.encodeURIComponent(
          profile.description || ""
        )}&profileId=${window.encodeURIComponent(profile.id)}&navigateUrl=`
      );
    } catch (e: any) {
      this.notify({
        message: msg("Sorry, couldn't create browser profile at this time."),
        variant: "danger",
        icon: "exclamation-octagon",
      });
    }
  }

  private async deleteProfile(profile: Profile) {
    try {
      const data = await this.apiFetch<Profile & { error?: boolean }>(
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
              >. Please remove browser profile from Workflow to continue.`
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

    return this.apiFetch<Browser>(
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

  private async getProfiles() {
    const data = await this.apiFetch<APIPaginatedList<Profile>>(
      `/orgs/${this.orgId}/profiles`,
      this.authState!
    );

    return data.items;
  }
}
