import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";

import type { AuthState } from "../../utils/AuthService";
import LiteElement, { html } from "../../utils/LiteElement";
import { Profile } from "./types";

/**
 * Usage:
 * ```ts
 * <btrix-browser-profiles-detail></btrix-browser-profiles-detail>
 * ```
 */
@localized()
export class BrowserProfilesDetail extends LiteElement {
  @property({ type: Object })
  authState!: AuthState;

  @property({ type: String })
  archiveId!: string;

  @property({ type: String })
  profileId!: string;

  @state()
  private profile: Partial<Profile> = {
    id: "2",
    name: "Twitter Webrecorder",
    description: "Et netus et malesuada fames.",
    created: new Date().toUTCString(),
    origins: ["https://twitter.com", "https://twitter.com/webrecorder_io"],
  };

  render() {
    return html`<div class="mb-7">
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

      <header>
        <h2 class="text-2xl font-medium mb-3 md:h-8">${this.profile.name}</h2>
      </header>`;
  }
}

customElements.define("btrix-browser-profiles-detail", BrowserProfilesDetail);
