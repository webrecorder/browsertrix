import { LitElement, html, css } from "lit";
import { state, property, query } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import type {
  SlInput,
  SlMenu,
  SlMenuItem,
  SlPopup,
} from "@shoelace-style/shoelace";
import inputCss from "@shoelace-style/shoelace/dist/components/input/input.styles.js";
import union from "lodash/fp/union";
import debounce from "lodash/fp/debounce";

export type Tags = string[];
export type TagsChangeEvent = CustomEvent<{
  tags: string[];
}>;
export type TagInputEvent = CustomEvent<{
  value: string;
}>;

/**
 * Usage:
 * ```ts
 * <btrix-tag-input
 *   initialTags=${[]}
 *   @tags-change=${console.log}
 * ></btrix-tag-input>
 * ```
 *
 * @events tag-input
 * @events tags-change
 */
@localized()
export class TagInput extends LitElement {
  static styles = css`
    :host {
      --tag-height: 1.5rem;
    }

    ${inputCss}

    .input {
      flex-wrap: wrap;
      height: auto;
      overflow: visible;
      min-height: calc(var(--tag-height) + 1rem);
    }

    .input__control {
      flex-grow: 1;
      flex-shrink: 0;
    }

    .input__control:not(:first-child) {
      padding-left: var(--sl-spacing-small);
      padding-right: var(--sl-spacing-small);
    }

    btrix-tag {
      margin-left: var(--sl-spacing-x-small);
      margin-top: calc(0.5rem - 1px);
      max-width: calc(
        100% - var(--sl-spacing-x-small) - var(--sl-spacing-x-small)
      );
    }

    sl-popup::part(popup) {
      z-index: 2;
    }

    .dropdown {
      position: absolute;
      transform-origin: top left;
    }

    .hidden {
      display: none;
    }

    .animateShow {
      animation: dropdownShow 100ms ease forwards;
    }

    .animateHide {
      animation: dropdownHide 100ms ease forwards;
    }

    @keyframes dropdownShow {
      from {
        opacity: 0;
        transform: scale(0.9);
      }

      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    @keyframes dropdownHide {
      from {
        opacity: 1;
        transform: scale(1);
      }

      to {
        opacity: 0;
        transform: scale(0.9);
        display: none;
      }
    }
  `;

  @property({ type: Array })
  initialTags?: Tags;

  @property({ type: Array })
  tagOptions: Tags = [];

  @property({ type: Boolean })
  disabled = false;

  // TODO validate required
  @property({ type: Boolean })
  required = false;

  @state()
  private tags: Tags = [];

  @state()
  private inputValue = "";

  @state()
  private dropdownIsOpen?: boolean;

  @query("#input")
  private input?: HTMLInputElement;

  @query("#dropdown")
  private dropdown!: HTMLDivElement;

  @query("sl-menu")
  private menu!: SlMenu;

  @query("sl-popup")
  private combobox!: SlPopup;

  connectedCallback() {
    if (this.initialTags) {
      this.tags = this.initialTags;
    }
    super.connectedCallback();
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("tags") && this.required) {
      if (this.tags.length) {
        this.removeAttribute("data-invalid");
      } else {
        this.setAttribute("data-invalid", "");
      }
    }
    if (changedProperties.has("dropdownIsOpen")) {
      if (this.dropdownIsOpen) {
        this.combobox.reposition();
      } else if (this.dropdownIsOpen === false) {
        // Hide on CSS animation end
        const onAnimationEnd = (e: AnimationEvent) => {
          if (e.animationName !== "dropdownHide") return;
          this.dropdownIsOpen = undefined;
          this.dropdown.removeEventListener("animationend", onAnimationEnd);
        };
        this.dropdown.addEventListener("animationend", onAnimationEnd);
      }
    }
  }

  reportValidity() {
    this.input?.reportValidity();
  }

  render() {
    const placeholder = msg("Tags separated by comma");
    return html`
      <div class="form-control form-control--has-label">
        <label
          class="form-control__label"
          part="form-control-label"
          for="input"
        >
          <slot name="label">${msg("Tags")}</slot>
        </label>
        <div
          class="input input--medium input--standard"
          tabindex="-1"
          @click=${this.onInputWrapperClick}
          @keydown=${this.onKeydown}
          @focusout=${(e: FocusEvent) => {
            const currentTarget = e.currentTarget as SlMenuItem;
            const relatedTarget = e.relatedTarget as HTMLElement;
            if (
              this.dropdownIsOpen &&
              !currentTarget?.contains(relatedTarget)
            ) {
              this.dropdownIsOpen = false;
            }
          }}
        >
          ${this.renderTags()}
          <sl-popup
            placement="bottom-start"
            strategy="fixed"
            skidding="4"
            distance="-4"
            active
          >
            <input
              slot="anchor"
              id="input"
              class="input__control"
              style="min-width: ${placeholder.length}ch"
              @focus=${this.onFocus}
              @blur=${this.onBlur}
              @input=${this.onInput}
              @keyup=${this.onKeyup}
              @paste=${this.onPaste}
              ?required=${this.required && !this.tags.length}
              placeholder=${placeholder}
              role="combobox"
              aria-controls="dropdown"
              aria-expanded="${this.dropdownIsOpen === true}"
            />
            <div
              id="dropdown"
              class="dropdown ${this.dropdownIsOpen === true
                ? "animateShow"
                : this.dropdownIsOpen === false
                ? "animateHide"
                : "hidden"}"
            >
              <sl-menu
                role="listbox"
                @keydown=${(e: KeyboardEvent) => {
                  e.stopPropagation();
                }}
                @keyup=${(e: KeyboardEvent) => {
                  e.stopPropagation();
                  if (e.key === "Escape") {
                    this.dropdownIsOpen = false;
                    this.input?.focus();
                  }
                }}
                @sl-select=${this.onSelect}
              >
                ${this.tagOptions
                  .slice(0, 3)
                  .map(
                    (tag) => html`
                      <sl-menu-item role="option" value=${tag}
                        >${tag}</sl-menu-item
                      >
                    `
                  )}
                ${this.tagOptions.length ? html`<sl-divider></sl-divider>` : ""}

                <sl-menu-item role="option" value=${this.inputValue}>
                  ${msg(str`Add “${this.inputValue.toLocaleLowerCase()}”`)}
                </sl-menu-item>
              </sl-menu>
            </div>
          </sl-popup>
        </div>
      </div>
    `;
  }

  private renderTags() {
    return this.tags.map(this.renderTag);
  }

  private renderTag = (content: string) => {
    const removeTag = () => {
      this.tags = this.tags.filter((v) => v !== content);
      this.dispatchChange();
    };
    return html`
      <btrix-tag
        variant="primary"
        removable
        @sl-remove=${() => {
          removeTag();
          this.input?.focus();
        }}
        title=${content}
        tabindex="-1"
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Backspace" || e.key === "Delete") {
            removeTag();
            const focusTarget = (e.target as HTMLElement)
              .previousElementSibling;
            if (focusTarget) (focusTarget as HTMLElement).focus();
          }
        }}
      >
        ${content}
      </btrix-tag>
    `;
  };

  private onSelect(e: CustomEvent) {
    this.addTags([e.detail.item.value]);
    this.input?.focus();
  }

  private onFocus(e: FocusEvent) {
    const input = e.target as HTMLInputElement;
    (input.parentElement as HTMLElement).classList.add("input--focused");
    if (input.value) {
      this.dropdownIsOpen = true;
    }
  }

  private onBlur(e: FocusEvent) {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget) {
      if (this.menu?.contains(relatedTarget)) {
        // Keep focus on form control if moving to menu selection
        return;
      }
      if (
        relatedTarget.tagName.includes("BUTTON") &&
        relatedTarget.getAttribute("type") === "reset"
      ) {
        // Don't add tag if resetting form
        return;
      }
    }
    const input = e.target as HTMLInputElement;
    (input.parentElement as HTMLElement).classList.remove("input--focused");
    this.addTags([input.value]);
  }

  private onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || (e.key === "Tab" && this.dropdownIsOpen)) {
      e.preventDefault();
      const menuItem = this.menu?.querySelector("sl-menu-item");
      if (menuItem) {
        // Reset roving tabindex set by shoelace
        this.menu!.setCurrentItem(menuItem);
        menuItem.focus();
      }
      return;
    }
    const el = e.target as HTMLElement;
    const isInputEl = this.input && el === this.input;
    switch (e.key) {
      // TODO localize, handle RTL
      case "ArrowLeft": {
        if (isInputEl && this.input!.selectionStart! > 0) return;
        const focusTarget = (isInputEl ? this.combobox : el)
          .previousElementSibling as HTMLElement | null;
        focusTarget?.focus();
        break;
      }
      case "ArrowRight": {
        // if (isInputEl && this.input!.selectionEnd! > this.input!.value.length)
        //   return;
        if (isInputEl) return;
        let focusTarget = el.nextElementSibling as HTMLElement | null;
        if (!focusTarget) return;
        if (focusTarget === this.combobox) {
          focusTarget = this.input || null;
        }
        focusTarget?.focus();
        break;
      }
      case ",":
      case "Enter": {
        e.preventDefault();

        const input = e.target as HTMLInputElement;
        const value = input.value.trim();
        if (value) {
          this.addTags([value]);
        }
        break;
      }
      default:
        break;
    }
  }

  private onInput = debounce(200)(async (e: InputEvent) => {
    const input = this.input!;
    this.inputValue = input.value;
    if (input.value.length) {
      this.dropdownIsOpen = true;
    } else {
      this.dropdownIsOpen = false;
    }
    this.dispatchEvent(
      <TagInputEvent>new CustomEvent("tag-input", {
        detail: { value: input.value },
      })
    );
  }) as any;

  private onKeyup(e: KeyboardEvent) {
    const input = e.target as HTMLInputElement;
    if (e.key === "Escape") {
      (input.parentElement as HTMLElement).classList.remove("input--focused");
      this.dropdownIsOpen = false;
      this.inputValue = "";
      input.value = "";
    }
  }

  private onPaste(e: ClipboardEvent) {
    const input = e.target as HTMLInputElement;
    if (!input.value) {
      e.preventDefault();
      const text = e.clipboardData?.getData("text");
      if (text) {
        this.addTags(text.split(","));
      }
    }
  }

  private onInputWrapperClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      this.input?.focus();
    }
  }

  private async addTags(tags: Tags) {
    await this.updateComplete;
    this.tags = union(
      tags
        .map((v) =>
          v
            // Remove zero-width characters
            .replace(/[\u200B-\u200D\uFEFF]/g, "")
            .trim()
            .toLocaleLowerCase()
        )
        .filter((v) => v),
      this.tags
    );
    this.dispatchChange();
    this.dropdownIsOpen = false;
    this.input!.value = "";
  }

  private async dispatchChange() {
    await this.updateComplete;
    this.dispatchEvent(
      <TagsChangeEvent>new CustomEvent("tags-change", {
        detail: { tags: this.tags },
      })
    );
  }
}
