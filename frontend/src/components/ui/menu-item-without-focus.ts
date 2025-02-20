/** A version of <sl-menu-item> that doesn't steal focus on mouseover */

import { SlMenuItem } from "@shoelace-style/shoelace";
import { customElement } from "lit/decorators.js";

@customElement("btrix-menu-item")
// @ts-expect-error this shouldn't be allowed, but idk of an easier way without
// forking the whole component
export class BtrixMenuItem extends SlMenuItem {
  private readonly handleMouseOver = (event: MouseEvent) => {
    // NOT doing this.focus();
    event.stopPropagation();
  };

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}
