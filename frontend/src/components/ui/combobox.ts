import type {
  SlChangeEvent,
  SlInput,
  SlInputEvent,
  SlMenu,
  SlOption,
  SlPopup,
} from "@shoelace-style/shoelace";
import clsx from "clsx";
import Fuse from "fuse.js";
import { css, html, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { HasSlotController } from "@/controllers/slot";
import { type BtrixChangeEvent } from "@/events/btrix-change";
import { type BtrixSelectEvent } from "@/events/btrix-select";
import { FormControl } from "@/mixins/FormControl";
import { validationMessageFor } from "@/strings/validation";
import { animateTo, stopAnimations } from "@/utils/animations";
import {
  dropdownHide,
  dropdownShow,
  dropdownTiming,
} from "@/utils/animations/dropdown";
import { tw } from "@/utils/tailwind";

export type ComboboxChangeEvent = BtrixChangeEvent<string>;
export type ComboboxSelectNewEvent = BtrixSelectEvent<SlOption>;

const SEARCH_KEY = "_searchValue";

const isOption = (el: null | EventTarget | HTMLElement): el is SlOption => {
  if (!el || !("tagName" in el)) return false;

  return el.tagName.toLowerCase() === "sl-option";
};

const getOption = (el: ChildNode | HTMLElement): null | SlOption => {
  if (!("tagName" in el)) return null;

  if (isOption(el)) {
    return el;
  }

  // Check if option is wrapped in a tooltip/popover
  if (["sl-tooltip", "btrix-popover"].includes(el.tagName.toLowerCase())) {
    return [...el.childNodes].find(isOption) || null;
  }

  return null;
};

/**
 * A combobox is a form input that combines text input with a popup of predefined options.
 * Typing into the text input narrows down the options, or optionally allows users to add
 * a new option.
 *
 * @slot new-option
 * @slot help-text
 *
 * @fires btrix-change
 * @fires btrix-select-new
 * @fires btrix-clear
 * @fires btrix-hide
 * @fires btrix-after-hide
 * @fires btrix-show
 * @fires btrix-after-show
 *
 * @TODO Support multiple values, to replace `<btrix-tag-input>`
 */
@customElement("btrix-combobox")
export class Combobox extends FormControl(TailwindElement) {
  static styles = [
    css`
      :host {
        position: relative;
        z-index: 3;
      }

      ::slotted(btrix-popover) {
        --show-delay: 300;
      }
    `,
  ];

  @property({ type: Boolean, useDefault: true })
  open = false;

  @property({ type: String, useDefault: true })
  name?: string;

  @property({ type: String, useDefault: true })
  label?: string;

  @property({ type: String, useDefault: true })
  value = "";

  @property({ type: String, useDefault: true })
  defaultValue?: string;

  @property({ type: String, useDefault: true })
  placeholder?: string;

  @property({ type: String, useDefault: true })
  helpText?: string;

  @property({ type: Boolean, useDefault: true })
  clearable = false;

  @property({ type: Boolean, useDefault: true })
  disabled = false;

  @property({ type: Boolean, useDefault: true })
  required = false;

  @property({ type: Boolean, useDefault: true })
  loading = false;

  @state()
  private displayValue = "";

  @state()
  private inputHasFocus = false;

  @state()
  private currentOption?: SlOption;

  @state()
  private selectedOption?: SlOption;

  @state()
  private filteredOptions = new Set<SlOption>();

  @query("#dropdown")
  private readonly dropdown?: HTMLDivElement;

  @query("sl-menu")
  private readonly menu?: SlMenu;

  @query("sl-popup")
  private readonly popup?: SlPopup;

  @query("sl-input")
  private readonly input?: SlInput;

  readonly #fuse = new Fuse<SlOption>([], {
    threshold: 0.2, // stricter; default is 0.6
    keys: [SEARCH_KEY],
  });
  readonly #hasSlotController = new HasSlotController(
    this,
    "help-text",
    "new-option",
  );

  public setCustomValidity(message: string) {
    if (message) {
      this.setValidity({ customError: true }, message);
    } else {
      this.setValidity({});
    }
  }

  formResetCallback() {
    super.formResetCallback();

    this.resetValue();
    this.resetInputDisplayValue();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeOpenListeners();
  }

  protected updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("value")) {
      this.setSelectedByValue(this.value);
      this.setFormValue(this.value);
    }

    if (changedProperties.has("value") || changedProperties.has("required")) {
      if (this.required && !this.value) {
        this.setValidity(
          { valueMissing: true },
          validationMessageFor.valueMissing,
        );
      } else {
        this.setValidity({ valueMissing: false });
      }
    }

    if (changedProperties.has("open")) {
      if (this.open) {
        void this.handleOpen();
      } else {
        void this.handleClose();
      }
    }
  }

  render() {
    const hasHelpText =
      !!this.helpText || this.#hasSlotController.test("help-text");
    const hasNew = this.#hasSlotController.test("new-option");
    const hasOptions = this.#hasSlotController.test("[default]");
    const emptySelected = this.selectedOption && !this.selectedOption.value;
    const noResults = Boolean(this.input?.value && !this.filteredOptions.size);

    return html`
      <sl-input
        id="input"
        class="part-[prefix]:pointer-events-none part-[suffix]:pointer-events-none"
        placeholder=${ifDefined(this.placeholder)}
        value=${emptySelected ? "" : this.displayValue}
        ?clearable=${this.clearable && !emptySelected}
        ?required=${this.required}
        ?disabled=${this.disabled || !(hasNew || hasOptions)}
        role="combobox"
        aria-autocomplete="list"
        aria-controls="combobox-list"
        aria-expanded="${this.open}"
        autocomplete="false"
        @keydown=${this.handleInputKeyDown}
        @click=${this.handleInputClick}
        @focus=${this.handleInputFocus}
        @focusout=${this.handleInputFocusOut}
        @sl-input=${this.handleInput}
        @sl-change=${this.handleChange}
        @sl-clear=${this.handleClear}
      >
        ${this.label
          ? html`<span id="combobox-list-label" slot="label"
              >${this.label}</span
            >`
          : html`<slot name="label" slot="label"></slot>`}
        ${this.loading
          ? html`<sl-spinner slot="prefix"></sl-spinner>`
          : nothing}
        ${hasNew || hasOptions
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

      <div class="form-help-text" ?hidden=${!hasHelpText}>
        <slot name="help-text">${this.helpText}</slot>
      </div>

      <sl-popup
        anchor=${
          // An ID is used as the popup anchor to correct positioning when there is help text
          "input"
        }
        placement="bottom-start"
        flip
        shift
        sync="width"
        strategy="fixed"
        auto-size="vertical"
        auto-size-padding="10"
        @keyup=${this.handleKeyUp}
      >
        <div
          id="dropdown"
          class="origin-top-left shadow-md contain-[layout_size]"
          ?hidden=${!hasNew && noResults}
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
            ${hasNew && hasOptions ? html`<sl-divider></sl-divider>` : nothing}
            <slot @slotchange=${this.handleOptionsSlotChange}></slot>
          </sl-menu>
        </div>
      </sl-popup>
    `;
  }

  private canOpen() {
    const hasNew = this.#hasSlotController.test("new-option");
    const hasOptions = this.#hasSlotController.test("[default]");

    return hasNew || hasOptions;
  }

  // Get all menu items
  private getMenuChildren() {
    return Array.from(this.childNodes).filter(
      (node): node is HTMLElement => node.nodeType === Node.ELEMENT_NODE,
    );
  }

  // All options, including new
  private getAllOptions() {
    return Array.from(this.childNodes).map(getOption).filter(isOption);
  }

  // Get options except new
  private getOptions() {
    return Array.from(this.childNodes).map(getOption).filter(isOption);
  }

  private getSearchResults() {
    const value = this.input?.value;

    if (value) {
      return new Set(this.#fuse.search(value).map(({ item }) => item));
    }

    return new Set<SlOption>();
  }

  private getFirstOption() {
    const options = this.getOptions();
    const results = this.getSearchResults();

    if (results.size) {
      return options.find((el) => !el.disabled && results.has(el));
    }

    return options.find((el) => !el.disabled);
  }

  private getOptionByValue(value: string) {
    return this.getOptions().find((el) => el.value === value) || null;
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

  private setSelectedOption(option: SlOption | null) {
    if (option && !option.disabled) {
      option.selected = true;
      this.value = option.value;
      this.displayValue = option.getTextLabel() || "";
      this.selectedOption = option;
    } else {
      this.selectedOption = undefined;
    }

    this.setCurrentOption(option);
  }

  private setSelectedByValue(value?: string) {
    const el = (value !== undefined && this.getOptionByValue(value)) || null;

    this.selectedChanged(el);
  }

  private selectedChanged(option: SlOption | null) {
    const allOptions = this.getAllOptions();

    // Clear selection
    allOptions.forEach((el) => {
      el.selected = false;
    });

    this.setSelectedOption(option);
  }

  private readonly handleOptionsSlotChange = (e: Event) => {
    const options = (e.target as HTMLSlotElement)
      .assignedElements()
      .map(getOption)
      .filter(isOption);

    options.forEach((el) => {
      if (el.value === this.value) {
        this.setSelectedOption(el);
      } else {
        el.selected = false;
      }

      if (!el.disabled) {
        (el as SlOption & { [SEARCH_KEY]: string })[SEARCH_KEY] =
          el.getTextLabel();
      }

      // Prevent option hover from changing input focus
      if (el.parentElement === this) {
        el.addEventListener("mouseover", this.handleOptionMouseOver, {
          capture: true,
        });
      }
    });

    if (!this.selectedOption) {
      this.resetValue();
    }

    this.filteredOptions = new Set();
    this.#fuse.setCollection(options);
  };

  private readonly handleOptionMouseOver = (e: Event) => {
    // HACK Fixes https://github.com/shoelace-style/shoelace/issues/1676
    e.stopImmediatePropagation();
  };

  private readonly selectOption = (el: SlOption) => {
    if (el.slot === "new-option") {
      this.dispatchEvent(
        new CustomEvent<ComboboxSelectNewEvent["detail"]>("btrix-select-new", {
          detail: { item: el },
        }),
      );
    } else {
      const nextValue = el.value;
      const hasChange = nextValue !== this.value;

      this.selectedChanged(el);

      if (hasChange) {
        this.dispatchEvent(
          new CustomEvent<ComboboxChangeEvent["detail"]>("btrix-change", {
            detail: { value: nextValue },
          }),
        );
      }
    }

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
        if (this.currentOption) {
          this.selectOption(this.currentOption);
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

  private async handleOpen() {
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

    if (!this.currentOption || this.currentOption !== this.selectedOption) {
      this.setCurrentOption(
        this.selectedOption || this.getFirstOption() || null,
      );
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

  private async handleClose() {
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

    this.dropdown.hidden = true;
    this.popup.active = false;

    this.resetFilteredItems();

    if (!this.displayValue) {
      this.resetInputDisplayValue();
    }

    this.dispatchEvent(new CustomEvent("btrix-after-hide"));
  }

  private resetValue() {
    this.value = this.defaultValue || "";
    this.displayValue =
      (this.defaultValue &&
        this.getOptionByValue(this.defaultValue)?.getTextLabel()) ||
      "";
  }

  private resetInputDisplayValue() {
    if (this.input) {
      this.input.value = this.displayValue;
    }
  }

  private resetFilteredItems(options: HTMLElement[] = this.getAllOptions()) {
    options.forEach((el) => {
      el.hidden = false;
    });
    this.filteredOptions = new Set();
  }

  private readonly handleInput = (e: SlInputEvent) => {
    const value = (e.target as SlInput).value;
    const children = this.getMenuChildren();

    if (value) {
      this.filteredOptions = this.getSearchResults();
      let firstOption: SlOption | null = null;

      children.forEach((el) => {
        const opt = getOption(el);

        if (isOption(opt)) {
          el.hidden = !this.filteredOptions.has(opt);
          if (!firstOption && !opt.hidden && !opt.disabled) {
            firstOption = opt;
          }
        } else {
          // Hide all menu children, including labels and dividers
          el.hidden = true;
        }
      });

      this.setCurrentOption(firstOption);
    } else {
      this.resetFilteredItems(children);
    }
  };

  private readonly handleChange = (e: SlChangeEvent) => {
    const value = (e.target as SlInput).value;

    if (!value && this.value) {
      // Check if there's an option with empty value
      this.selectedChanged(this.getOptionByValue(""));
      this.filteredOptions = new Set();
    } else {
      this.filteredOptions = this.getSearchResults();

      if (this.filteredOptions.size === 1) {
        const [option] = this.filteredOptions;
        this.selectedChanged(option);
      } else if (this.selectedOption) {
        this.resetInputDisplayValue();
      } else {
        this.selectedChanged(null);
      }
    }
  };

  private readonly handleClear = () => {
    this.selectedChanged(this.getOptionByValue(""));

    this.dispatchEvent(new CustomEvent("btrix-clear"));
  };

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
