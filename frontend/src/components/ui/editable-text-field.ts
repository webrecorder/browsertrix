import { localized } from "@lit/localize";
import clsx from "clsx";
import { css, html, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { styleMap } from "lit/directives/style-map.js";

import { TailwindElement } from "@/classes/TailwindElement";
import { measureTextWithElement } from "@/utils/measure-text";
import { tw } from "@/utils/tailwind";

@customElement("btrix-editable-text-field")
@localized()
export class EditableTextField extends TailwindElement {
  @property({ type: String })
  value = "";

  @state()
  inputValue = this.value;

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

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener("click", async () => {
      this.editing = true;
      void this.updateWidth();
    });
    this.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.toggleEditing();
      }
      if (e.key === "Escape") {
        this.endEditing(false);
      }
      if (e.key === "Space") {
        this.startEditing();
      }
    });
    setTimeout(() => {
      void this.updateWidth();
      void this.updatePlaceholderWidth();
    }, 0);
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
    void this.updateWidth();
  }

  endEditing(save = true) {
    this.editing = false;
    if (!save) {
      this.inputValue = this.value;
    }
    void this.updateWidth();
  }

  async updateWidth() {
    await this.updateComplete;
    if (!this.label) return;
    const width = measureTextWithElement(
      this.inputValue || this.placeholder || "",
      this.label,
      true,
    ).width;
    if (width) this.width = width;
  }

  async updatePlaceholderWidth() {
    if (!this.placeholder) return;
    await this.updateComplete;
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
        void this.updateWidth();
        void this.updatePlaceholderWidth();
      }, 0);
    }
  }

  firstUpdated() {
    void this.updateWidth();
    void this.updatePlaceholderWidth();
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
    return html`<input
        class="absolute inset-3 rounded bg-transparent"
        type="text"
        .value=${this.inputValue}
        placeholder=${ifDefined(this.placeholder)}
        @input=${(e: Event) => {
          this.inputValue = (e.target as HTMLInputElement).value;
          void this.updateWidth();
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
            this.endEditing(false);
          }
        }}
        style=${styleMap({
          color: this.editing ? undefined : "transparent",
          width: `${this.width}px`,
          minWidth: `${this.placeholderWidth}px`,
        })}
      />
      <span
        class=${clsx(
          tw`pointer-events-none block truncate rounded outline-1 outline-offset-[--sl-focus-ring-offset] outline-[--sl-input-border-color] host-hover:outline`,
          !this.inputValue && tw`text-neutral-500`,
        )}
        style=${styleMap({
          visibility: this.editing ? "hidden" : "visible",
          minWidth: this.editing ? `${this.placeholderWidth}px` : undefined,
        })}
      >
        ${this.inputValue
          ? this.renderContent
            ? this.renderContent(this.inputValue)
            : this.inputValue
          : this.placeholder}
      </span>`;
  }
}
