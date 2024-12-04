import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";

@localized()
@customElement("btrix-not-found")
export class NotFound extends BtrixElement {
  render() {
    return html`
      <div class="text-center text-neutral-500">
        <p class="my-4 border-b py-4 text-xl leading-none text-neutral-400">
          ${msg("Page not found")}
        </p>
        <p>
          ${msg("Did you click a link to get here?")}
          <button
            class="text-blue-500 transition-colors hover:text-blue-600"
            @click=${() => {
              window.history.back();
            }}
          >
            ${msg("Go Back")}
          </button>
          <br />
          ${msg("Or")}
          <btrix-link
            href="https://github.com/webrecorder/browsertrix/issues/new/choose"
          >
            ${msg("Report a Broken Link")}
          </btrix-link>
        </p>
      </div>
    `;
  }
}
