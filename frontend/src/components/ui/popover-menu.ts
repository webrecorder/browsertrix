import SlDropdown from "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import { customElement, property } from "lit/decorators.js";
import debounce from "lodash/fp/debounce";

/**
 * Dropdown menu that opens on hover.
 *
 * @attr open
 * @attr placement
 * @attr disabled
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

    const clear = () => {
      this.debouncedShow.cancel();
    };
    const hide = (e: Event) => {
      e.stopPropagation();
      this.debouncedShow.cancel();
      void this.hide();
    };

    this.addEventListener("mouseenter", this.debouncedShow);
    this.addEventListener("mouseleave", hide);
    this.addEventListener("focus", clear);
    this.addEventListener("click", clear);
    this.addEventListener("sl-select", hide);
    // `<btrix-menu-item-link>` will fire `btrix-select` instead of `sl-select`
    this.addEventListener("btrix-select", hide);
  }

  disconnectedCallback(): void {
    this.debouncedShow.cancel();
    super.disconnectedCallback();
  }

  firstUpdated(): void {
    const popup = this.renderRoot.querySelector("sl-popup")!;
    popup.hoverBridge = true;
  }

  private readonly debouncedShow = debounce(200)((e: Event) => {
    e.stopPropagation();
    void this.show();
  });
}
