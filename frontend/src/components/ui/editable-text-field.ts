import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { css, html, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import type { DirectiveResult } from "lit/directive.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { styleMap } from "lit/directives/style-map.js";

import { TailwindElement } from "@/classes/TailwindElement";
import type { BtrixChangeEvent } from "@/events/btrix-change";
import type { BtrixInputEvent } from "@/events/btrix-input";
import localize from "@/utils/localize";
import { measureTextWithElement } from "@/utils/measure-text";
import { tw } from "@/utils/tailwind";

export type EditableTextFieldInputEvent = BtrixInputEvent<string>;
export type EditableTextFieldChangeEvent = BtrixChangeEvent<string>;

/**
 * In-place editor for single-line text.
 */
@customElement("btrix-editable-text-field")
@localized()
export class EditableTextField extends TailwindElement {
  @property({ type: String })
  label = "";

  @property({ type: String })
  value = "";

  @state()
  inputValue = "";

  @state()
  editing = false;

  @state()
  width = 0;

  @property({ type: Number })
  minLength?: number;

  @property({ type: Number })
  maxLength?: number;

  @property({ attribute: false })
  renderContent?: (text: string) => TemplateResult | DirectiveResult;

  /**
   * Extra width to add to the computed width to accommodate the suffix slot.
   */
  @property({ type: Number })
  extraWidth = 0;

  static styles = css`
    :host {
      display: inline-block;
      position: relative;
    }
  `;

  @query("input")
  input?: HTMLInputElement;

  @property({ type: String })
  placeholder?: string;

  @state()
  placeholderWidth = 0;

  @state()
  valid: boolean | undefined = true;

  /**
   * Used to show an unsaved warning when the user blurs the field with an
   * invalid value.
   */
  @state()
  showUnsavedWarning = false;

  private readonly handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      this.save();
    }
    if (e.key === "Escape") {
      this.endEditing(false);
    }
  };

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("keydown", this.handleKeydown);
  }

  disconnectedCallback() {
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
    this.showUnsavedWarning = false;
    if (!save) {
      this.inputValue = this.value;
    }
    this.valid = true;
    this.input?.blur();
    this.updateWidth();
    this.updatePlaceholderWidth();
  }

  save() {
    if (this.checkValidity()) {
      if (this.editing) {
        this.dispatchEvent(
          new CustomEvent<EditableTextFieldChangeEvent["detail"]>(
            "btrix-change",
            {
              detail: { value: this.inputValue },
              bubbles: true,
              composed: true,
            },
          ),
        );
      }
      this.endEditing();
    } else {
      this.showUnsavedWarning = true;
    }
  }

  updateWidth() {
    const width = measureTextWithElement(
      this.inputValue || this.placeholder || "",
      this,
    ).width;
    if (width) this.width = width + this.extraWidth;
  }

  updatePlaceholderWidth() {
    if (!this.placeholder) return;
    const width = measureTextWithElement(this.placeholder, this).width;
    if (width) this.placeholderWidth = width + this.extraWidth;
  }

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("value")) {
      this.inputValue = this.value;
    }

    if (
      changedProperties.has("inputValue") ||
      changedProperties.has("placeholder")
    ) {
      this.updateWidth();
      this.updatePlaceholderWidth();
    }
  }

  updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("editing") && this.editing) {
      this.input?.focus();
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
    const minWidth = Math.max(this.placeholderWidth, this.width, 1);

    return html`<label class="sr-only">${this.label}</label>
      <input
        class=${clsx(
          tw`peer absolute inset-4 rounded bg-transparent`,
          !this.valid && tw`z-[21] outline outline-danger`,
        )}
        type="text"
        spellcheck="${this.editing ? this.spellcheck : false}"
        .value=${this.inputValue}
        placeholder=${ifDefined(this.placeholder)}
        @input=${async (e: Event) => {
          this.inputValue = (e.target as HTMLInputElement).value;
          this.checkValidity();

          await this.updateComplete;
          this.dispatchEvent(
            new CustomEvent<EditableTextFieldInputEvent["detail"]>(
              "btrix-input",
              {
                detail: { value: this.inputValue },
                bubbles: true,
                composed: true,
              },
            ),
          );
        }}
        @focus=${() => {
          this.startEditing();
        }}
        @blur=${this.save}
        @keydown=${this.handleKeydown}
        style=${styleMap({
          color: this.editing ? undefined : "transparent",
          width: `min(${minWidth}px, calc(100% - 2rem))`,
          minWidth: `${this.placeholderWidth}px`,
        })}
      />
      <span
        class=${clsx(
          tw`pointer-events-none flex cursor-text select-none items-center gap-1.5 whitespace-pre rounded outline-1 outline-offset-[--sl-focus-ring-offset] outline-[--sl-input-border-color] peer-hover:outline peer-active:outline-none host-focus-within:outline-none`,
          !this.inputValue && tw`text-neutral-500`,
        )}
        style=${styleMap({
          visibility: this.editing ? "hidden" : "visible",
          width: this.editing ? `${minWidth}px` : "auto",
        })}
      >
        <span class="truncate"
          >${this.inputValue
            ? this.renderContent
              ? this.renderContent(this.inputValue)
              : this.inputValue
            : this.placeholder}</span
        >
        <slot name="suffix"></slot
      ></span>
      ${this.maxLength && !this.valid
        ? html`<span
            class="absolute bottom-0 right-4 z-20 rounded-b-sm bg-white pt-1 text-xs font-semibold tabular-nums leading-none text-danger"
          >
            ${this.showUnsavedWarning ? html`${msg("Unsaved")} - ` : null}
            ${localize.number(this.inputValue.length)} /
            ${localize.number(this.maxLength)}
          </span>`
        : null}`;
  }
}
