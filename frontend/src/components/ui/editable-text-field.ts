import { localized } from "@lit/localize";
import clsx from "clsx";
import { css, html, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { styleMap } from "lit/directives/style-map.js";

import { TailwindElement } from "@/classes/TailwindElement";
import localize from "@/utils/localize";
import { measureTextWithElement } from "@/utils/measure-text";
import { tw } from "@/utils/tailwind";

@customElement("btrix-editable-text-field")
@localized()
export class EditableTextField extends TailwindElement {
  @property({ type: String })
  value = "";

  @state()
  inputValue = "";

  @property({ type: String })
  innerClass = "";

  @state()
  editing = false;

  @state()
  width = 0;

  @property({ type: Number })
  minLength?: number;

  @property({ type: Number })
  maxLength?: number;

  @property({ type: Object })
  renderContent?: (text: string) => TemplateResult;

  static styles = css`
    :host {
      display: inline-block;
      position: relative;
      cursor: text;
      border-radius: var(--sl-border-radius-medium);
    }
  `;

  @query("input")
  input?: HTMLInputElement;

  @query("span")
  label?: HTMLSpanElement;

  @property({ type: String })
  placeholder?: string;

  @state()
  placeholderWidth = 0;

  @state()
  valid: boolean | undefined = true;

  private readonly handleClick = () => {
    this.editing = true;
    this.updateWidth();
  };

  private readonly handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      this.toggleEditing();
    }
    if (e.key === "Escape") {
      this.endEditing(false);
    }
    if (e.key === "Space") {
      this.startEditing();
    }
  };

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("click", this.handleClick);
    this.addEventListener("keydown", this.handleKeydown);
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.handleClick);
    this.removeEventListener("keydown", this.handleKeydown);
    super.disconnectedCallback();
  }

  toggleEditing() {
    if (this.editing) {
      this.endEditing();
    } else {
      this.startEditing();
    }
  }

  startEditing() {
    this.editing = true;
    this.updateWidth();
  }

  endEditing(save = true) {
    this.editing = false;
    if (!save) {
      this.inputValue = this.value;
    }
    this.valid = true;
    this.updateWidth();
  }

  updateWidth() {
    // await this.updateComplete;
    if (!this.label) return;
    const width = measureTextWithElement(
      this.inputValue || this.placeholder || "",
      this.label,
    ).width;
    if (width) this.width = width;
  }

  updatePlaceholderWidth() {
    if (!this.placeholder) return;
    // await this.updateComplete;
    if (!this.label) return;
    const width = measureTextWithElement(this.placeholder, this.label).width;
    if (width) this.placeholderWidth = width;
  }

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("value")) {
      this.inputValue = this.value;
    }
  }

  updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("editing") && this.editing) {
      this.input?.focus();
      setTimeout(() => {
        this.updateWidth();
        this.updatePlaceholderWidth();
      }, 0);
    }
  }

  checkValidity() {
    let valid = true;
    if (this.minLength && this.inputValue.length < this.minLength) {
      valid = false;
    }
    if (this.maxLength && this.inputValue.length > this.maxLength) {
      valid = false;
    }
    this.valid = valid;
    return valid;
  }

  render() {
    // Normally we wouldn't want to run code like this on every render, but it's
    // a) cached by args already, and b) very quick to run - these use canvas
    // text measurements, rather than element measurements which cause reflows
    this.updateWidth();
    this.updatePlaceholderWidth();
    return html`<input
        class=${clsx(
          tw`absolute inset-4 rounded bg-transparent`,
          !this.valid && tw`outline outline-danger`,
        )}
        type="text"
        .value=${this.inputValue}
        placeholder=${ifDefined(this.placeholder)}
        @input=${(e: Event) => {
          this.inputValue = (e.target as HTMLInputElement).value;
          this.checkValidity();
        }}
        @blur=${() => {
          if (this.checkValidity()) {
            this.endEditing();
            this.dispatchEvent(
              new CustomEvent("btrix-change", {
                detail: this.inputValue,
                bubbles: true,
                composed: true,
              }),
            );
          } else {
            // this.endEditing(false);
          }
        }}
        style=${styleMap({
          color: this.editing ? undefined : "transparent",
          width: `min(${Math.max(this.placeholderWidth, this.width)}px, calc(100% - 2rem))`,
          minWidth: `${this.placeholderWidth}px`,
        })}
      />
      <span
        class=${clsx(
          tw`pointer-events-none block select-none truncate whitespace-pre rounded outline-1 outline-offset-[--sl-focus-ring-offset] outline-[--sl-input-border-color] host-hover:outline host-active:outline-none host-focus-within:outline-none`,
          !this.inputValue && tw`text-neutral-500`,
        )}
        style=${styleMap({
          visibility: this.editing ? "hidden" : "visible",
          width: `min(${Math.max(this.placeholderWidth, this.width)}px, auto)`,
        })}
        >${this.inputValue
          ? this.renderContent
            ? this.renderContent(this.inputValue)
            : this.inputValue
          : this.placeholder}</span
      >
      ${this.maxLength && !this.valid
        ? html`<span
            class="absolute bottom-0 right-4 text-xs leading-none text-danger"
          >
            ${localize.number(this.inputValue.length)} /
            ${localize.number(this.maxLength)}
          </span>`
        : null}`;
  }
}
