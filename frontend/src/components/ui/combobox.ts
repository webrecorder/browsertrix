import type {
  SlInput,
  SlMenu,
  SlOption,
  SlPopup,
} from "@shoelace-style/shoelace";
import clsx from "clsx";
import { css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { HasSlotController } from "@/controllers/slot";
import { type BtrixSelectEvent } from "@/events/btrix-select";
import { animateTo, stopAnimations } from "@/utils/animations";
import {
  dropdownHide,
  dropdownShow,
  dropdownTiming,
} from "@/utils/animations/dropdown";
import { tw } from "@/utils/tailwind";

export type ComboboxSelectEvent = BtrixSelectEvent<SlOption>;

const isOption = (el: null | EventTarget | HTMLElement): el is SlOption =>
  !!el && "tagName" in el && el.tagName.toLowerCase() === "sl-option";

/**
 * Input that opens a popup of autocomplete options.
 *
 * @slot new-option
 *
 * @fires btrix-select
 * @fires btrix-hide
 * @fires btrix-after-hide
 * @fires btrix-show
 * @fires btrix-after-show
 */
@customElement("btrix-combobox")
export class Combobox extends TailwindElement {
  static styles = [
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
  private inputHasFocus = false;

  @state()
  private currentOption?: SlOption;

  @query("#dropdown")
  private readonly dropdown?: HTMLDivElement;

  @query("sl-menu")
  private readonly menu?: SlMenu;

  @query("sl-popup")
  private readonly popup?: SlPopup;

  @query("sl-input")
  private readonly input?: SlInput;

  private readonly hasSlotController = new HasSlotController(
    this,
    "new-option",
  );

  protected updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("open")) {
      if (this.open) {
        void this.openDropdown();
      } else if (changedProperties.get("open")) {
        void this.closeDropdown();
      }
    }
  }

  render() {
    const hasNew = this.hasSlotController.test("new-option");
    const hasItems = this.hasSlotController.test("[default]");

    return html`
      <sl-popup
        placement="bottom-start"
        flip
        shift
        sync="width"
        strategy="fixed"
        auto-size="vertical"
        auto-size-padding="10"
        @keyup=${this.handleKeyUp}
      >
        <sl-input
          slot="anchor"
          class="part-[prefix]:pointer-events-none part-[suffix]:pointer-events-none"
          placeholder=${ifDefined(this.placeholder)}
          value=${this.displayValue || this.value || ""}
          ?clearable=${this.clearable && !!this.value}
          ?disabled=${this.disabled}
          role="combobox"
          aria-autocomplete="list"
          aria-controls="combobox-list"
          aria-expanded="${this.open}"
          autocomplete="false"
          @keydown=${this.handleInputKeyDown}
          @click=${this.handleInputClick}
          @focus=${this.handleInputFocus}
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
          ${hasNew || hasItems
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

        <div
          id="dropdown"
          class="origin-top-left shadow-md contain-[layout_size]"
        >
          <sl-menu
            id="combobox-list"
            class="max-h-[--auto-size-available-height]"
            role="listbox"
            aria-labelledby="combobox-list-label"
            @focusout=${this.handleMenuFocusOut}
            @keydown=${this.handleMenuKeyDown}
            @click=${this.handleMenuClick}
          >
            <slot name="new-option"></slot>
            ${hasNew && hasItems ? html`<sl-divider></sl-divider>` : nothing}
            <slot @slotchange=${this.handleSlotChange}></slot>
          </sl-menu>
        </div>
      </sl-popup>
    `;
  }

  private canOpen() {
    const hasNew = this.hasSlotController.test("new-option");
    const hasItems = this.hasSlotController.test("[default]");

    return hasNew || hasItems;
  }

  private getAllOptions() {
    return Array.from(this.childNodes).filter(
      (node): node is SlOption =>
        node.nodeType === node.ELEMENT_NODE && isOption(node as HTMLElement),
    );
  }

  private getFirstOption() {
    const options = this.getAllOptions();

    return options.find((el) => !el.disabled);
  }

  private getLastOption() {
    const options = this.getAllOptions();

    return options.findLast((el) => !el.disabled);
  }

  private setCurrentOption(option: SlOption | null) {
    const allOptions = this.getAllOptions();

    // Clear selection
    allOptions.forEach((el) => {
      el.current = false;
      el.tabIndex = -1;
    });

    // Select the target option
    if (option) {
      this.currentOption = option;
      option.current = true;
      option.tabIndex = 0;
    }
  }

  private readonly handleSlotChange = () => {
    this.getAllOptions().forEach((el) => {
      if (this.value !== undefined && el.value === this.value) {
        el.selected = true;
      }
      el.addEventListener("mouseover", this.handleOptionMouseOver, {
        capture: true,
      });
    });
  };

  private readonly handleOptionMouseOver = (e: Event) => {
    // HACK Fixes https://github.com/shoelace-style/shoelace/issues/1676
    e.stopImmediatePropagation();

    this.setCurrentOption(e.currentTarget as SlOption);
  };

  private readonly selectOption = (el: SlOption) => {
    this.dispatchEvent(
      new CustomEvent<ComboboxSelectEvent["detail"]>("btrix-select", {
        detail: { item: el },
      }),
    );
    this.hide();
  };

  private readonly handleMenuFocusOut = (e: FocusEvent) => {
    if (!e.relatedTarget) {
      this.hide();
    }
  };

  private readonly onNavigationKeyDown = (e: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
      const allOptions = this.getAllOptions();
      const currentIndex = this.currentOption
        ? allOptions.indexOf(this.currentOption)
        : -1;
      let newIndex = Math.max(0, currentIndex);

      // Prevent scrolling
      e.preventDefault();

      // Open it
      if (!this.open) {
        this.show();

        // If an option is already selected, stop here because we want that one to remain highlighted when the listbox
        // opens for the first time
        if (this.currentOption) {
          return;
        }
      }

      if (e.key === "ArrowDown") {
        newIndex = currentIndex + 1;
        if (newIndex > allOptions.length - 1) newIndex = 0;
      } else if (e.key === "ArrowUp") {
        newIndex = currentIndex - 1;
        if (newIndex < 0) newIndex = allOptions.length - 1;
      } else if (e.key === "Home") {
        newIndex = 0;
      } else if (e.key === "End") {
        newIndex = allOptions.length - 1;
      }

      const option = allOptions[newIndex];
      this.setCurrentOption(option);
    }
  };

  private readonly handleMenuKeyDown = (e: KeyboardEvent) => {
    // Close when pressing escape
    if (e.key === "Escape" && this.open) {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
      this.input?.focus({ preventScroll: true });
    }

    // Handle enter and space
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopImmediatePropagation();

      // If it's not open, open it
      if (!this.open) {
        this.show();
        return;
      }

      // If it is open, update the value based on the current selection and close it
      if (this.currentOption && !this.currentOption.disabled) {
        this.selectOption(this.currentOption);
      }

      return;
    }

    // Navigate menu
    this.onNavigationKeyDown(e);

    // All other "printable" keys trigger type to select
    if ((e.key && e.key.length === 1) || e.key === "Backspace") {
      // Don't block important key combos like CMD+R
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      // Open, unless the key that triggered is backspace
      if (!this.open) {
        if (e.key === "Backspace") {
          return;
        }

        this.show();
      }

      e.stopPropagation();
      e.preventDefault();
    }
  };

  private readonly handleMenuClick = (e: MouseEvent) => {
    if (isOption(e.target)) {
      this.selectOption(e.target);
    }
  };

  private readonly handleInputKeyDown = (e: KeyboardEvent) => {
    if (this.open) {
      if (e.key === "Enter") {
        if (this.input?.value) {
          // TODO Find matching option
        } else {
          if (this.currentOption) {
            this.selectOption(this.currentOption);
          }
        }
      }

      this.onNavigationKeyDown(e);
    } else {
      if (e.key !== "Escape" && this.canOpen()) {
        this.show();
      }
    }
  };

  private readonly handleKeyUp = (e: KeyboardEvent) => {
    if (this.open && e.key === "Escape") {
      this.hide();
    }
  };

  private readonly handleInputClick = (e: MouseEvent) => {
    if (e.target !== e.currentTarget) return;

    if (!this.inputHasFocus) {
      this.input?.focus({ preventScroll: true });
    }

    if (this.open) {
      this.hide();
    } else {
      if (this.canOpen()) {
        this.show();
      }
    }
  };

  private readonly handleInputFocus = () => {
    this.inputHasFocus = true;
    this.input?.select();
  };

  private readonly handleInputFocusOut = () => {
    this.inputHasFocus = false;
  };

  private async openDropdown() {
    if (!this.popup) {
      console.debug("no this.popup");
      return;
    }

    if (!this.dropdown) {
      console.debug("no this.dropdown");
      return;
    }

    this.dispatchEvent(new CustomEvent("btrix-show"));
    this.addOpenListeners();

    await stopAnimations(this.dropdown);

    this.dropdown.hidden = false;
    this.popup.active = true;

    if (!this.currentOption) {
      const firstOption = this.getFirstOption();

      if (firstOption) {
        this.setCurrentOption(firstOption);
      } else {
        console.debug("no firstOption");
      }
    }

    // // Manually sync dropdown width instead of using `sync="width"`
    // // to get around ResizeObserver loop error
    // const anchor = this.anchor?.length ? this.anchor[0] : this.input;
    // if (anchor && this.dropdown) {
    //   const anchorWidth = anchor.clientWidth;
    //   if (anchorWidth) {
    //     this.dropdown.style.width = `${anchorWidth}px`;
    //   }
    // }

    await animateTo(this.dropdown, dropdownShow, dropdownTiming);

    this.dispatchEvent(new CustomEvent("btrix-after-show"));
  }

  private async closeDropdown() {
    if (!this.popup) {
      console.debug("no this.popup");
      return;
    }

    if (!this.dropdown) {
      console.debug("no this.dropdown");
      return;
    }

    this.dispatchEvent(new CustomEvent("btrix-hide"));
    this.removeOpenListeners();

    await stopAnimations(this.dropdown);
    await animateTo(this.dropdown, dropdownHide, dropdownTiming);

    this.currentOption = undefined;

    this.dropdown.hidden = true;
    this.popup.active = false;

    this.dispatchEvent(new CustomEvent("btrix-after-hide"));
  }

  private addOpenListeners() {
    document.addEventListener("focusin", this.handleOutsideEvent);
    document.addEventListener("click", this.handleOutsideEvent);
  }

  private removeOpenListeners() {
    document.removeEventListener("focusin", this.handleOutsideEvent);
    document.removeEventListener("click", this.handleOutsideEvent);
  }

  private readonly handleOutsideEvent = (e: Event) => {
    // Close when focusing out of the select
    const path = e.composedPath();
    if ((this as unknown) && !path.includes(this)) {
      this.hide();
    }
  };

  public show() {
    this.open = true;
  }

  public hide() {
    this.open = false;
  }
}
