import { property, state } from "lit/decorators.js";
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
  language: "json" | "yaml" = "json";

  @state()
  lineCount = 1;

  @state()
  errorMessage = "";

  firstUpdated() {
    this.lineCount = this.value.split("\n").length;
  }

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.get("value")) {
      this.lineCount = this.value.split("\n").length;
    }
  }

  render() {
    return html`
      <article class="border rounded">
        <header class="flex justify-between bg-neutral-50 border-b p-1">
          <sl-select
            value=${this.language}
            size="small"
            hoist
            @sl-hide=${this.stopProp}
            @sl-after-hide=${this.stopProp}
            @sl-select=${this.handleLanguageChange}
          >
            <sl-menu-item value="json">${msg("JSON")}</sl-menu-item>
            <sl-menu-item value="yaml">${msg("YAML")}</sl-menu-item>
          </sl-select>

          <btrix-copy-button .value=${this.value}></btrix-copy-button>
        </header>

        ${this.renderTextArea()}

        <div class="text-sm">
          ${this.errorMessage
            ? html`<btrix-alert type="danger">
                <div class="whitespace-pre-wrap">${this.errorMessage}</div>
              </btrix-alert> `
            : html` <btrix-alert> ${msg("Valid configuration")} </btrix-alert>`}
        </div>
      </article>
    `;
  }

  private renderTextArea() {
    return html`
      <div class="flex font-mono text-sm leading-relaxed py-2">
        <div class="shrink-0 w-12 px-2 text-right text-neutral-300">
          ${[...new Array(this.lineCount)].map(
            (line, i) => html`${i + 1}<br />`
          )}
        </div>
        <div class="flex-1 px-2 overflow-x-auto text-slate-700">
          <textarea
            class="language-${this
              .language} block w-full h-full overflow-y-hidden outline-none resize-none"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            wrap="off"
            rows=${this.lineCount}
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
              } else if (e.keyCode === /* enter: */ 13) {
                this.lineCount = this.lineCount + 1;
              }
            }}
            @change=${(e: any) => {
              e.stopPropagation();
              this.onChange(e.target.value);
            }}
            @paste=${(e: any) => {
              // Use timeout to get value after paste
              window.setTimeout(() => {
                const { value } = e.target;

                // Update line count pre-emptively in case there's an
                // error with the pasted values
                this.lineCount = value.split("\n").length;

                this.onChange(value);
              });
            }}
          ></textarea>
        </div>
      </div>
    `;
  }

  private handleParseError(error: Error) {
    if (error instanceof SyntaxError) {
      // TODO better user-facing error
      const errorMessage = error.message.replace("JSON.parse: ", "");
      this.errorMessage = `${errorMessage
        .charAt(0)
        .toUpperCase()}${errorMessage.slice(1)}`;
    } else if (error instanceof YAMLParseError) {
      const errorMessage = error.message.replace("YAMLParseError: ", "");
      this.errorMessage = errorMessage;
    } else {
      console.debug(error);
    }
  }

  private handleLanguageChange(e: any) {
    this.language = e.target.value;
    this.errorMessage = "";

    let value = this.value;

    try {
      switch (this.language) {
        case "json":
          const yaml = yamlToJson(this.value);
          value = JSON.stringify(yaml, null, 2);
          break;
        case "yaml":
          const json = JSON.parse(this.value);
          value = yamlStringify(json);
          break;
        default:
          break;
      }

      this.onChange(value);
    } catch (e: any) {
      this.handleParseError(e);
    }
  }

  private checkValidity(value: string) {
    if (this.language === "json") {
      JSON.parse(value);
    } else if (this.language === "yaml") {
      yamlToJson(value);
    }
  }

  private onChange(nextValue: string) {
    try {
      this.checkValidity(nextValue);

      this.errorMessage = "";

      this.dispatchEvent(
        new CustomEvent("on-change", {
          detail: {
            value: nextValue,
          },
        })
      );
    } catch (e: any) {
      this.handleParseError(e);
    }
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
