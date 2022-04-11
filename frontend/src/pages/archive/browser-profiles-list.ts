import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";

type BrowserProfile = {
  id: string;
  name: string;
  description: string;
  last_updated: string;
  domains: string[];
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
  browserProfiles: BrowserProfile[] = [
    // {
    //   id: "1",
    //   name: "Twitter Example",
    //   description:
    //     "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    //   last_updated: new Date().toUTCString(),
    //   domains: ["https://twitter.com"],
    // },
    // {
    //   id: "2",
    //   name: "Twitter Webrecorder",
    //   description: "Et netus et malesuada fames.",
    //   last_updated: new Date().toUTCString(),
    //   domains: ["https://twitter.com", "https://twitter.com/webrecorder_io"],
    // },
  ];

  render() {
    return html` ${this.renderTable()} `;
  }

  renderTable() {
    return html`
      <div role="table">
        <div class="mb-2 px-4" role="rowgroup">
          <div
            class="hidden md:grid grid-cols-8 gap-3 md:gap-5 text-sm text-neutral-500"
            role="row"
          >
            <div class="col-span-4" role="columnheader" aria-sort="none">
              ${msg("Description")}
            </div>
            <div class="col-span-1" role="columnheader" aria-sort="none">
              ${msg("Last Updated")}
            </div>
            <div class="col-span-3" role="columnheader" aria-sort="none">
              ${msg("Domains Visited")}
            </div>
          </div>
        </div>
        ${this.browserProfiles && this.browserProfiles.length
          ? html`<div class="border rounded" role="rowgroup">
              ${this.browserProfiles.map(this.renderItem.bind(this))}
            </div>`
          : html`
              <div class="border-t border-b py-5">
                <p class="text-center text-0-500">
                  ${msg("No browser profiles yet.")}
                </p>
              </div>
            `}
      </div>
    `;
  }

  private renderItem(data: BrowserProfile) {
    return html`
      <a
        class="block p-4 leading-none hover:bg-zinc-50 hover:text-primary border-t first:border-t-0 transition-colors"
        href=${`/archives/${this.archiveId}/browser-profiles/profile/${data.id}`}
        @click=${this.navLink}
        title=${data.name}
      >
        <div class="grid grid-cols-8 gap-3 md:gap-5" role="row">
          <div class="col-span-8 md:col-span-4" role="cell">
            <div class="font-medium mb-1">${data.name}</div>
            <div class="text-sm truncate" title=${data.description}>
              ${data.description}
            </div>
          </div>
          <div class="col-span-8 md:col-span-1 text-sm" role="cell">
            ${new Date(data.last_updated).toLocaleDateString()}
          </div>
          <div class="col-span-8 md:col-span-3 text-sm" role="cell">
            ${data.domains.join(", ")}
          </div>
        </div>
      </a>
    `;
  }
}

customElements.define("btrix-browser-profiles-list", BrowserProfilesList);
