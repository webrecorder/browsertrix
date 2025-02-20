import { consume } from "@lit/context";
import type { SlMenu, SlMenuItem, SlPopup } from "@shoelace-style/shoelace";
import { css, html, type PropertyValues } from "lit";
import {
  customElement,
  property,
  query,
  queryAssignedElements,
  state,
} from "lit/decorators.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { popupBoundary } from "@/context/popup-boundary";
import { dropdown } from "@/utils/css";

/**
 * Input that opens a popup of autocomplete options
 *
 * Usage:
 * ```ts
 * ```
 *
 * @event request-close
 */
@customElement("btrix-combobox")
export class Combobox extends TailwindElement {
  static styles = [
    dropdown,
    css`
      :host {
        position: relative;
        z-index: 2;
      }
    `,
  ];

  @property({ type: Boolean })
  open = false;

  @property({ type: Boolean })
  loading = false;

  @consume({ context: popupBoundary })
  @state()
  autoSizeBoundary?: Element | Element[] | undefined;

  @state()
  isActive = true;

  @query("#dropdown")
  private readonly dropdown?: HTMLDivElement;

  @query("sl-menu")
  private readonly menu?: SlMenu;

  @query("sl-popup")
  private readonly combobox?: SlPopup;

  @queryAssignedElements({
    flatten: true,
  })
  private readonly anchor?: HTMLElement[];

  @queryAssignedElements({
    slot: "menu-item",
    selector: "sl-menu-item",
    flatten: true,
  })
  private readonly menuItems?: SlMenuItem[];

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("open")) {
      if (this.open) {
        void this.openDropdown();
      } else {
        this.closeDropdown();
      }
    }
  }

  render() {
    console.log(this.autoSizeBoundary);
    return html`
      <sl-popup
        placement="bottom-start"
        shift
        strategy="fixed"
        autoSize="both"
        .autoSizeBoundary=${this.autoSizeBoundary}
        ?active=${this.isActive}
        @keydown=${this.onKeydown}
        @keyup=${this.onKeyup}
        @focusout=${this.onFocusout}
      >
        <div slot="anchor" class="relative z-20">
          <slot></slot>
        </div>
        <div
          id="dropdown"
          class="dropdown z-10 -mt-2 hidden"
          @animationend=${(e: AnimationEvent) => {
            const el = e.target as HTMLDivElement;
            if (e.animationName === "dropdownShow") {
              el.classList.remove("animateShow");
            }
            if (e.animationName === "dropdownHide") {
              el.classList.add("hidden");
              el.classList.remove("animateHide");
              this.isActive = false;
            }
          }}
        >
          <sl-menu role="listbox" class="border-t-0 pt-4">
            <!-- <div class="fixed inset-0 bg-neutral-50 opacity-25">
              <sl-spinner></sl-spinner>
            </div> -->
            <slot name="menu-item"></slot>
          </sl-menu>
        </div>
      </sl-popup>
    `;
  }

  private async onFocusout(e: FocusEvent) {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!this.open) {
      return;
    }

    if (
      !relatedTarget ||
      (!this.anchor?.some((item) => item === relatedTarget) &&
        !this.menuItems?.some((item) => item === relatedTarget))
    ) {
      await this.updateComplete;
      this.dispatchEvent(new CustomEvent("request-close"));
    }
  }

  private onKeydown(e: KeyboardEvent) {
    if (this.open && e.key === "ArrowDown") {
      if (
        this.menu &&
        this.menuItems?.length &&
        !this.menu.getCurrentItem() &&
        !this.menuItems[0].disabled
      ) {
        // Focus on first menu item
        e.preventDefault();
        const menuItem = this.menuItems[0];
        this.menu.setCurrentItem(menuItem);
        menuItem.focus();
      }
    }
  }

  private async onKeyup(e: KeyboardEvent) {
    if (this.open && e.key === "Escape") {
      await this.updateComplete;
      this.dispatchEvent(new CustomEvent("request-close"));
    }
  }

  private async openDropdown() {
    this.isActive = true;
    await this.combobox?.updateComplete;

    // Manually sync dropdown width instead of using `sync="width"`
    // to get around ResizeObserver loop error
    if (this.anchor?.length && this.dropdown) {
      const anchorWidth = this.anchor[0].clientWidth;
      if (anchorWidth) {
        this.dropdown.style.width = `${anchorWidth}px`;
      }
    }

    this.dropdown?.classList.add("animateShow");
    this.dropdown?.classList.remove("hidden");
  }

  private closeDropdown() {
    this.dropdown?.classList.add("animateHide");
  }

  public show() {
    this.open = true;
  }

  public hide() {
    this.open = false;
  }
}
