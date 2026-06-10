import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { css, html, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { styleMap } from "lit/directives/style-map.js";

import type { Prose, ProseClampingEvent } from "./prose";

import { TailwindElement } from "@/classes/TailwindElement";
import type { BtrixChangeEvent } from "@/events/btrix-change";
import type { BtrixInputEvent } from "@/events/btrix-input";
import localize from "@/utils/localize";
import { richText } from "@/utils/rich-text";
import { tw } from "@/utils/tailwind";

export type EditableTextBoxInputEvent = BtrixInputEvent<string>;
export type EditableTextBoxChangeEvent = BtrixChangeEvent<string>;

/**
 * In-place editor for multi-line text.
 */
@customElement("btrix-editable-text-box")
@localized()
export class EditableTextBox extends TailwindElement {
  static styles = css`
    :host {
      display: block;
      position: relative;
    }
  `;

  @property({ type: String })
  value = "";

  @property({ type: String })
  placeholder = "";

  @property({ type: Number })
  clamp?: number;

  @property({ type: Boolean })
  plainText = false;

  @property({ type: Boolean })
  enterToSave = false;

  @property({ type: Number })
  minLength?: number;

  @property({ type: Number })
  maxLength?: number;

  @state()
  editing = false;

  @state()
  private inputValue = "";

  @state()
  private clamping = false;

  @state()
  private valid: boolean | undefined = true;

  @state()
  private showUnsavedWarning = false;

  @query("textarea")
  private readonly textarea?: HTMLTextAreaElement | null;

  @query("btrix-prose")
  private readonly prose?: Prose | null;

  private readonly handleKeydown = (e: KeyboardEvent) => {
    if (this.enterToSave) {
      if (e.key === "Enter") {
        e.preventDefault();
        this.save();
      }
    }
    if (e.key === "Escape") {
      this.endEditing(false);
    }
  };

  startEditing() {
    this.editing = true;
    if (this.textarea) {
      this.textarea.value = this.value;
    }
  }

  endEditing(save = true) {
    this.editing = false;
    this.showUnsavedWarning = false;
    if (!save) {
      this.inputValue = this.value;
    }
    this.valid = true;

    if (this.textarea) {
      this.textarea.value = "";
      this.textarea.blur();
    }
  }

  save() {
    if (this.checkValidity()) {
      if (this.editing) {
        this.dispatchEvent(
          new CustomEvent<EditableTextBoxChangeEvent["detail"]>(
            "btrix-change",
            {
              detail: { value: this.inputValue },
              bubbles: true,
              composed: true,
            },
          ),
        );
      }
      this.value = this.inputValue;
      this.endEditing();
    } else {
      this.showUnsavedWarning = true;
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

  willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("value")) {
      this.inputValue = this.value;
    }
  }

  updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has("editing") && this.editing) {
      this.textarea?.focus();
    }

    if (changedProperties.has("value")) {
      void this.prose?.syncClamp();
    }
  }

  render() {
    return html`
      <btrix-prose
        class=${clsx(
          tw`part-[base]:max-w-full`,
          this.value && tw`part-[base]:pr-4`,
          this.editing && tw`hidden`,
        )}
        style=${styleMap({
          "--btrix-line-clamp": this.clamp,
        })}
        @btrix-prose-clamping=${(e: ProseClampingEvent) => {
          this.clamping = e.detail.clamping;
        }}
        >${this.value
          ? this.plainText
            ? this.value
            : richText(this.value)
          : html`<span class="invisible" aria-hidden="true"
              >${this.placeholder}</span
            >`}<span
          class=${clsx(
            this.value ? tw`absolute end-0 top-0` : tw`ml-1.5 align-middle`,
          )}
          aria-hidden="true"
          ><sl-icon
            name="pencil"
            class="size-3 text-neutral-600"
          ></sl-icon></span
      ></btrix-prose>
      <textarea
        class=${clsx(
          tw`block min-w-full resize-none hyphens-auto text-pretty rounded bg-transparent leading-normal [scrollbar-gutter:stable]`,
          this.clamping && [this.editing ? tw`mb-[1.3125rem]` : tw`bottom-5`],
          this.editing
            ? tw`[field-sizing:content]`
            : tw`absolute inset-0 outline-1 outline-offset-[--sl-focus-ring-offset] outline-[--sl-input-border-color] hover:outline`,
          !this.valid && tw`outline outline-danger`,
        )}
        spellcheck="${this.editing ? true : false}"
        placeholder=${ifDefined(
          this.editing || !this.value ? this.placeholder : undefined,
        )}
        rows=${ifDefined(this.clamp)}
        @input=${async (e: Event) => {
          this.inputValue = (e.target as HTMLTextAreaElement).value;
          this.checkValidity();

          await this.updateComplete;

          this.dispatchEvent(
            new CustomEvent<EditableTextBoxInputEvent["detail"]>(
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
      ></textarea>
      ${this.maxLength && !this.valid
        ? html`<span
            class="absolute bottom-0 right-4 z-20 rounded-b-sm bg-white pt-1 text-xs font-semibold tabular-nums leading-none text-danger"
          >
            ${this.showUnsavedWarning ? html`${msg("Unsaved")} - ` : null}
            ${localize.number(this.inputValue.length)} /
            ${localize.number(this.maxLength)}
          </span>`
        : null}
    `;
  }
}
