import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";

type Profile = {
  id: string;
  name: string;
  description: string;
  created: string;
  origins: string[];
  baseId: string;
  baseProfileName: string;
  aid: string;
  resource: {
    filename: string;
    hash: string;
    size: number;
  };
};

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

  @state()
  browserProfiles?: Profile[];

  firstUpdated() {
    this.fetchCrawls();
  }

  render() {
    return html` ${this.renderTable()} `;
  }

  renderTable() {
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
}

customElements.define("btrix-browser-profiles-list", BrowserProfilesList);
