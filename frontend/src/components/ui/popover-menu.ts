import SlDropdown from "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import { customElement, property } from "lit/decorators.js";

/**
 * Dropdown menu that opens on hover.
 *
 * @attr open
 * @attr placement
 * @attr distance
 * @attr hoist
 */
@customElement("btrix-popover-menu")
export class PopoverMenu extends SlDropdown {
  @property({ type: String })
  placement: SlDropdown["placement"] = "bottom-end";

  @property({ type: Number })
  distance = 6;

  constructor() {
    super();

    const show = (e: Event) => {
      e.stopPropagation();
      void this.show();
    };

    const hide = (e: Event) => {
      e.stopPropagation();
      void this.hide();
    };

    this.addEventListener("mouseenter", show);
    this.addEventListener("mouseleave", hide);
    this.addEventListener("sl-select", hide);
    // `<btrix-menu-item-link>` will fire `btrix-select` instead of `sl-select`
    this.addEventListener("btrix-select", hide);
  }

  firstUpdated(): void {
    const popup = this.renderRoot.querySelector("sl-popup")!;
    popup.hoverBridge = true;
  }
}
