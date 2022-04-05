import { property, state, query } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";
import {
  parse as yamlToJson,
  stringify as yamlStringify,
  YAMLParseError,
} from "yaml";

import LiteElement, { html } from "../utils/LiteElement";

/**
 * Usage example:
 * ```ts
 * <btrix-config-editor
 *   value=${value}
 *   @on-change=${handleChange}
 * >
 * </btrix-config-editor>
 * ```
 *
 * @event on-change
 */
@localized()
export class ConfigEditor extends LiteElement {
  @property({ type: String })
  value = "";

  @state()
  errorMessage = "";

  @query("#config-editor-textarea")
  textareaElem?: HTMLTextAreaElement;

  render() {
    return html`
      <article class="border rounded">
        <header
          class="flex items-center justify-between bg-neutral-50 border-b p-1"
        >
          <div class="px-1">
            ${this.errorMessage
              ? html`
                  <sl-icon
                    class="text-danger inline-block align-middle mr-1"
                    name="x-octagon"
                  ></sl-icon>
                  <span
                    class="inline-block align-middle text-sm text-neutral-500"
                    >${msg("Invalid Configuration")}</span
                  >
                `
              : html`
                  <sl-icon
                    class="text-success inline-block align-middle mr-1"
                    name="check2"
                  ></sl-icon>
                  <span
                    class="inline-block align-middle text-sm text-neutral-500"
                    >${msg("Valid Configuration")}</span
                  >
                `}
          </div>

          <btrix-copy-button
            .getValue=${() => this.textareaElem?.value}
          ></btrix-copy-button>
        </header>

        ${this.renderTextArea()}

        <div class="text-sm">
          ${this.errorMessage
            ? html`<btrix-alert type="danger">
                <div class="whitespace-pre-wrap">${this.errorMessage}</div>
              </btrix-alert> `
            : ""}
        </div>
      </article>
    `;
  }

  private renderTextArea() {
    const lineCount = this.value.split("\n").length;

    return html`
      <div class="flex font-mono text-sm leading-relaxed py-2">
        <div class="shrink-0 w-12 px-2 text-right text-neutral-300">
          ${[...new Array(lineCount)].map((line, i) => html`${i + 1}<br />`)}
        </div>
        <div class="flex-1 px-2 overflow-x-auto text-slate-600">
          <textarea
            name="config"
            id="config-editor-textarea"
            class="language-yaml block w-full h-full overflow-y-hidden outline-none resize-none"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            wrap="off"
            rows=${lineCount}
            .value=${this.value}
            @keydown=${(e: any) => {
              const textarea = e.target;

              // Add indentation when pressing tab key instead of moving focus
              if (e.keyCode === /* tab: */ 9) {
                e.preventDefault();

                textarea.setRangeText(
                  "  ",
                  textarea.selectionStart,
                  textarea.selectionStart,
                  "end"
                );
              }
            }}
            @change=${(e: any) => {
              e.stopPropagation();
              this.onChange((e.target as HTMLTextAreaElement).value);
            }}
            @blur=${(e: any) => {
              e.stopPropagation();
              this.onBlur((e.target as HTMLTextAreaElement).value);
            }}
            @paste=${(e: any) => {
              // Use timeout to get value after paste
              window.setTimeout(() => {
                this.onChange((e.target as HTMLTextAreaElement).value);
              });
            }}
          ></textarea>
        </div>
      </div>
    `;
  }

  private handleParseError(error: Error) {
    if (error instanceof YAMLParseError) {
      const errorMessage = error.message.replace("YAMLParseError: ", "");
      this.errorMessage = errorMessage;
    } else {
      this.errorMessage = msg("Invalid YAML or JSON");
      console.debug(error);
    }
  }

  private checkValidity(value: string) {
    yamlToJson(value);
  }

  private onBlur(value: string) {
    if (!value) {
      this.textareaElem?.setCustomValidity(msg("Please fill out this field"));
      this.textareaElem?.reportValidity();
    }
  }

  private onChange(value: string) {
    try {
      this.checkValidity(value);
      this.textareaElem?.setCustomValidity("");
      this.errorMessage = "";
      this.dispatchEvent(
        new CustomEvent("on-change", {
          detail: {
            value: value,
          },
        })
      );
    } catch (e: any) {
      this.textareaElem?.setCustomValidity(msg("Please fix errors"));
      this.handleParseError(e);
    }

    this.textareaElem?.reportValidity();
  }

  /**
   * Stop propgation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: CustomEvent) {
    e.stopPropagation();
  }
}
