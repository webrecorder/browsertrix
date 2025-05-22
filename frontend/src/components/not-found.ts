import { localized, msg } from "@lit/localize";
import { html, nothing } from "lit";
import { customElement } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";
import { pageError } from "@/layouts/pageError";

@localized()
@customElement("btrix-not-found")
export class NotFound extends BtrixElement {
  render() {
    return html`
      ${pageError({
        heading: msg("Sorry, we couldn’t find that page"),
        detail: msg("Check the URL to make sure you’ve entered it correctly."),
        primaryAction: html`<sl-button
          href="/"
          @click=${this.navigate.link}
          size="small"
          >${msg("Go to Home")}</sl-button
        >`,
        secondaryAction: html`
          ${msg("Did you click a link to get here?")}
          <button
            class="text-blue-500 transition-colors hover:text-blue-600"
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
        `,
      })}
    `;
  }
}
