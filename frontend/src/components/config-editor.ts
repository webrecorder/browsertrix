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
        <textarea
          class="language-${this
            .language} block w-full text-slate-700 p-4 font-mono text-sm"
          autocomplete="off"
          rows="10"
          spellcheck="false"
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
          @change=${(e: any) => {
            e.stopPropagation();
            this.onChange(e.target.value);
          }}
        ></textarea>
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
