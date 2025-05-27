import { localized, msg } from "@lit/localize";
import { html } from "lit";
import { customElement } from "lit/decorators.js";

import { BtrixElement } from "@/classes/BtrixElement";

@localized()
@customElement("btrix-verified-badge")
export class Component extends BtrixElement {
  render() {
    return html`
      <sl-tooltip
        class="part-[body]:max-w-48 part-[body]:text-xs"
        content=${msg(
          "This organization has been verified by Webrecorder to be who they say they are.",
        )}
      >
        <btrix-tag
          ><sl-icon name="check-circle-fill" class="-ml-1 mr-1"></sl-icon>${msg(
            "Verified",
          )}</btrix-tag
        >
      </sl-tooltip>
    `;
  }
}
