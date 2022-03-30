import { property, state } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";
import { parse as jsonToYaml, stringify as yamlToJson } from "yaml";
import parseJson from "parse-json";

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

  render() {
    return html`
      <article class="border rounded">
        <header class="flex bg-neutral-50 border-b p-1">
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
        </header>
        ${this.renderTextArea()}
      </article>
    `;
  }

  private handleLanguageChange(e: any) {
    this.language = e.target.value;

    let value = this.value;

    try {
      switch (this.language) {
        case "json":
          const yaml = jsonToYaml(this.value);
          value = JSON.stringify(yaml, null, 2);
          break;
        case "yaml":
          const json = JSON.parse(this.value);
          value = yamlToJson(json);
          break;
        default:
          break;
      }

      this.onChange(value);
    } catch (e) {
      console.debug(e);

      // TODO handle parse error
    }
  }

  private renderTextArea() {
    const lines = this.value.split("\n");
    const rowCount = lines.length + 1;

    return html`
      <div>
        <div class="flex font-mono text-sm leading-relaxed">
          <div class="shrink-0 w-12 px-2 text-right text-neutral-400">
            ${[...new Array(rowCount)].map((line, i) => html`${i + 1}<br />`)}
          </div>
          <div class="flex-1 px-2 overflow-auto text-slate-700">
            <textarea
              class="language-${this
                .language} block w-full h-full outline-none resize-none"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              wrap="off"
              rows=${rowCount}
              .value=${this.value}
              @keydown=${(e: any) => {
                // Add indentation when pressing tab key instead of moving focus
                if (e.keyCode === /* tab: */ 9) {
                  e.preventDefault();

                  const textarea = e.target;

                  textarea.setRangeText(
                    "  ",
                    textarea.selectionStart,
                    textarea.selectionStart,
                    "end"
                  );
                }
              }}
              @keyup=${(e: any) => {
                if (e.keyCode === /* enter: */ 13) {
                  this.onChange(e.target.value);
                }
              }}
              @change=${(e: any) => {
                e.stopPropagation();
                this.onChange(e.target.value);
              }}
              @paste=${(e: any) => {
                // Use timeout to get value after paste
                window.setTimeout(() => {
                  this.onChange(e.target.value);
                });
              }}
            ></textarea>
          </div>
        </div>
      </div>
    `;
  }

  private onChange(nextValue: string) {
    this.dispatchEvent(
      new CustomEvent("on-change", {
        detail: {
          value: nextValue,
        },
      })
    );
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
