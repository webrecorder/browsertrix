import { localized, msg } from "@lit/localize";
import { html, nothing } from "lit";
import { customElement } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";

@localized()
@customElement("btrix-not-found")
export class NotFound extends BtrixElement {
  render() {
    return html`
      <div class="text-center">
        <p class="my-4 border-b py-4 text-xl leading-none text-neutral-500">
          ${msg("Sorry, we couldn’t find that page")}
        </p>
        <p class="text-neutral-600">
          ${msg("Check the URL to make sure you’ve entered it correctly.")}
        </p>
        <div class="my-4">
          <sl-button href="/" @click=${this.navigate.link} size="small"
            >${msg("Go to Home")}</sl-button
          >
        </div>
        <p class="text-neutral-500">
          ${msg("Did you click a link to get here?")}
          <button
            class="text-cyan-500 transition-colors hover:text-cyan-600"
            @click=${() => {
              window.history.back();
            }}
          >
            ${msg("Go Back")}
          </button>
          ${this.navigate.isPublicPage
            ? nothing
            : html`
                <br />
                ${msg("Or")}
                <btrix-link
                  href="https://github.com/webrecorder/browsertrix/issues/new/choose"
                >
                  ${msg("Report a Broken Link")}
                </btrix-link>
              `}
        </p>
      </div>
    `;
  }
}
