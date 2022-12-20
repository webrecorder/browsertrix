import { LitElement, html, css } from "lit";
import { state, property, query } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import type { SlInput } from "@shoelace-style/shoelace";
import inputCss from "@shoelace-style/shoelace/dist/components/input/input.styles.js";
import union from "lodash/fp/union";

export type TimeInputChangeEvent = CustomEvent<{
  hour: number;
  minute: number;
  period: "AM" | "PM";
}>;

/**
 * Usage:
 * ```ts
 * <btrix-time-input
 *   hour="1"
 *   minute="1"
 *   period="AM"
 *   @time-change=${console.log}
 * ></btrix-time-input>
 * ```
 *
 * @events
 */
@localized()
export class TagInput extends LitElement {
  static styles = css`
    :host {
      --sl-input-spacing-medium: var(--sl-spacing-x-small);
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
      --sl-input-spacing-medium: var(--sl-spacing-small);
      align-self: center;
      background: yellow;
      width: 100%;
    }

    .dropdownWrapper {
      flex: 1 0 10rem;
    }

    sl-tag {
      margin-left: var(--sl-spacing-2x-small);
      margin-top: calc(0.5rem - 1px);
    }

    sl-tag::part(base) {
      height: var(--tag-height);
      background-color: var(--sl-color-blue-100);
      border-color: var(--sl-color-blue-500);
      color: var(--sl-color-blue-600);
    }

    sl-tag::part(remove-button) {
      color: var(--sl-color-blue-600);
      border-radius: 100%;
      transition: background-color 0.1s;
    }

    sl-tag::part(remove-button):hover {
      background-color: var(--sl-color-blue-600);
      color: #fff;
    }

    .dropdown {
      position: absolute;
      z-index: 9999;
      margin-top: -0.25rem;
      margin-left: 0.25rem;
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

  @property({ type: Boolean })
  disabled = false;

  // TODO validate required
  @property({ type: Boolean })
  required = false;

  @state()
  private tags: string[] = ["test"];

  @state()
  private inputValue = "";

  @state()
  private dropdownIsOpen?: boolean;

  @query("#input")
  private input!: HTMLInputElement;

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("tags") && this.required) {
      if (this.tags.length) {
        this.removeAttribute("data-invalid");
      } else {
        this.setAttribute("data-invalid", "");
      }
    }
  }

  reportValidity() {
    this.input.reportValidity();
  }

  render() {
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
          @click=${this.onInputWrapperClick}
        >
          ${this.renderTags()}

          <div class="dropdownWrapper">
            <input
              slot="trigger"
              id="input"
              class="input__control"
              @focus=${this.onFocus}
              @blur=${this.onBlur}
              @keydown=${this.onKeydown}
              @keyup=${this.onKeyup}
              ?required=${this.required && !this.tags.length}
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
              <sl-menu role="listbox" @sl-select=${this.onSelect}>
                <!-- TODO tag options from API -->
                <sl-menu-item role="option" value=${this.inputValue}
                  >${msg(str`Add “${this.inputValue}”`)}</sl-menu-item
                >
              </sl-menu>
            </div>
          </div>
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
    };
    return html`
      <sl-tag variant="primary" pill removable @sl-remove=${removeTag}
        >${content}</sl-tag
      >
    `;
  };

  private onSelect(e: CustomEvent) {
    this.tags = union([e.detail.item.value], this.tags);
    this.input.value = "";
    this.dropdownIsOpen = false;
  }

  private onFocus(e: FocusEvent) {
    const el = e.target as HTMLInputElement;
    (el.parentElement as HTMLElement).classList.add("input--focused");
  }

  private async onBlur(e: FocusEvent) {
    const el = e.target as HTMLInputElement;
    (el.parentElement as HTMLElement).classList.remove("input--focused");
    this.dropdownIsOpen = false;
  }

  private async onKeydown(e: KeyboardEvent) {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();

      const el = e.target as HTMLInputElement;
      const value = el.value.trim();
      if (!value) return;

      await this.updateComplete;
      this.tags = union([value], this.tags);
      this.dropdownIsOpen = false;
      el.value = "";
    }
  }

  private async onKeyup(e: KeyboardEvent) {
    const el = e.target as HTMLInputElement;
    this.inputValue = el.value;
    if (el.value.length) {
      this.dropdownIsOpen = true;
    }
  }

  private onInputWrapperClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      this.input.focus();
    }
  }
}
