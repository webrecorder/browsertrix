import type { SlInput, SlMenu, SlPopup } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { focusable } from "tabbable";

import { TailwindElement } from "@/classes/TailwindElement";
import { HasSlotController } from "@/controllers/slot";
import { dropdown } from "@/utils/css";
import { tw } from "@/utils/tailwind";

/**
 * Input that opens a popup of autocomplete options.
 *
 * @slot new-menu-item
 * @slot menu-item
 * @fires btrix-close
 */
@customElement("btrix-combobox")
export class Combobox extends TailwindElement {
  static styles = [
    dropdown,
    css`
      :host {
        position: relative;
        z-index: 3;
      }
    `,
  ];

  @property({ type: Boolean })
  open = false;

  @property({ type: String })
  label?: string;

  @property({ type: String })
  value?: string;

  @property({ type: String })
  displayValue?: string;

  @property({ type: String })
  placeholder?: string;

  @property({ type: Boolean })
  clearable = false;

  @property({ type: Boolean })
  disabled = false;

  @property({ type: Boolean })
  loading = false;

  @state()
  isActive = true;

  @state()
  private inputHasFocus = false;

  @query("#dropdown")
  private readonly dropdown?: HTMLDivElement;

  @query("sl-menu")
  private readonly menu?: SlMenu;

  @query("sl-popup")
  private readonly combobox?: SlPopup;

  @query("sl-input")
  private readonly input?: SlInput;

  private readonly hasSlotController = new HasSlotController(
    this,
    "new-menu-item",
    "menu-item",
  );

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
    const hasNew = this.hasSlotController.test("new-menu-item");
    const hasItems = this.hasSlotController.test("menu-item");

    console.log("render");

    return html`
      <sl-popup
        placement="bottom-start"
        flip
        shift
        sync="width"
        strategy="fixed"
        auto-size="vertical"
        auto-size-padding="10"
        ?active=${this.isActive}
        @keyup=${this.handleKeyUp}
      >
        <sl-input
          slot="anchor"
          class="part-[prefix]:pointer-events-none part-[suffix]:pointer-events-none"
          placeholder=${ifDefined(this.placeholder)}
          value=${this.displayValue || ""}
          ?clearable=${this.clearable && !!this.value}
          ?disabled=${this.disabled}
          role="combobox"
          aria-autocomplete="list"
          aria-controls="combobox-list"
          aria-expanded="${this.isActive}"
          autocomplete="false"
          @keydown=${this.handleKeyDown}
          @click=${this.handleInputClick}
          @focus=${() => {
            if (hasNew || hasItems) {
              this.show();
            }
            this.handleInputFocus();
          }}
          @focusout=${this.handleInputFocusOut}
        >
          ${this.label
            ? html`<span id="combobox-list-label" slot="label"
                >${this.label}</span
              >`
            : nothing}
          ${this.loading
            ? html`<sl-spinner slot="prefix"></sl-spinner>`
            : nothing}
          ${hasItems
            ? html`<sl-icon
                slot="suffix"
                class=${clsx(
                  tw`flex items-center transition-transform`,
                  this.open ? tw`-rotate-180` : tw`rotate-0`,
                )}
                library="system"
                name="chevron-down"
              ></sl-icon>`
            : nothing}
        </sl-input>

        <div id="dropdown" class="dropdown hidden">
          <sl-menu
            id="combobox-list"
            class="max-h-[--auto-size-available-height]"
            role="listbox"
            aria-labelledby="combobox-list-label"
            @sl-select=${this.handleSelect}
            @focusout=${this.handleMenuFocusOut}
          >
            <slot name="new-menu-item"></slot>
            ${hasNew && hasItems ? html`<sl-divider></sl-divider>` : nothing}
            <slot name="menu-item"></slot>
          </sl-menu>
        </div>
      </sl-popup>
    `;
  }

  private readonly handleSelect = () => {
    this.hide();
  };

  private readonly handleMenuFocusOut = (e: FocusEvent) => {
    if (!e.relatedTarget) {
      this.hide();
    }
  };

  // TODO Consolidate with `select-collection-thumbnail`
  private getFirstFocusable() {
    if (!this.menu) {
      console.debug("no this.menu");
      return false;
    }

    const options = focusable(this.menu, { getShadowRoot: true });

    if (options.length) {
      return options[0];
    }
  }

  // TODO Consolidate with `select-collection-thumbnail`
  private getLastFocusable() {
    if (!this.menu) {
      console.debug("no this.menu");
      return false;
    }

    const options = focusable(this.menu, { getShadowRoot: true });

    if (options.length) {
      return options[options.length - 1];
    }
  }

  // TODO Consolidate with `select-collection-thumbnail`
  private readonly handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "Tab":
      case "ArrowDown": {
        const focusable = this.getFirstFocusable();
        if (focusable) {
          e.stopPropagation();
          focusable.focus();
        }
        break;
      }
      case "ArrowUp": {
        const focusable = this.getLastFocusable();
        if (focusable) {
          e.stopPropagation();
          focusable.focus();
        }
        break;
      }
      case "Enter":
      case " ": {
        // Prevent making selection
        e.preventDefault();
        e.stopPropagation();
        break;
      }
      default:
        break;
    }
  };

  private readonly handleKeyUp = async (e: KeyboardEvent) => {
    if (this.open && e.key === "Escape") {
      this.hide();
      await this.updateComplete;
      this.dispatchEvent(new CustomEvent("btrix-close"));
    }
  };

  private readonly handleInputClick = (e: MouseEvent) => {
    if (e.target !== e.currentTarget) return;

    if (!this.inputHasFocus && !this.open) {
      this.input?.focus();
    }
  };

  private readonly handleInputFocus = () => {
    this.inputHasFocus = true;
    this.input?.select();
  };

  private readonly handleInputFocusOut = (e: FocusEvent) => {
    this.inputHasFocus = false;

    if (!e.relatedTarget) {
      this.hide();
    }
  };

  private async openDropdown() {
    this.isActive = true;
    await this.combobox?.updateComplete;

    // // Manually sync dropdown width instead of using `sync="width"`
    // // to get around ResizeObserver loop error
    // const anchor = this.anchor?.length ? this.anchor[0] : this.input;
    // if (anchor && this.dropdown) {
    //   const anchorWidth = anchor.clientWidth;
    //   if (anchorWidth) {
    //     this.dropdown.style.width = `${anchorWidth}px`;
    //   }
    // }

    this.attachAnimationEvents();
    this.dropdown?.classList.add("animateShow");
    this.dropdown?.classList.remove("hidden");
  }

  private closeDropdown() {
    this.attachAnimationEvents();
    this.dropdown?.classList.add("animateHide");
  }

  private attachAnimationEvents() {
    this.dropdown?.removeEventListener(
      "animationcancel",
      this.handleAnimationEnd,
    );
    this.dropdown?.removeEventListener("animationend", this.handleAnimationEnd);
    this.dropdown?.addEventListener(
      "animationcancel",
      this.handleAnimationEnd,
      {
        once: true,
      },
    );
    this.dropdown?.addEventListener("animationend", this.handleAnimationEnd, {
      once: true,
    });
  }

  private readonly handleAnimationEnd = (e: AnimationEvent) => {
    const el = e.target as HTMLDivElement;
    if (e.animationName === "dropdownShow") {
      el.classList.remove("animateShow");
    }
    if (e.animationName === "dropdownHide") {
      el.classList.add("hidden");
      el.classList.remove("animateHide");
      this.isActive = false;
    }
  };

  public show() {
    this.open = true;
  }

  public hide() {
    this.open = false;
  }
}
