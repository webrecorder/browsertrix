import { state, property } from "lit/decorators.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import { msg, localized } from "@lit/localize";
import RegexColorize from "regex-colorize";

import type { CrawlConfig } from "../pages/archive/types";
import LiteElement, { html } from "../utils/LiteElement";
import { regexEscape } from "../utils/string";
import type { Exclusion } from "./queue-exclusion-form";

/**
 * Crawl queue exclusion table
 *
 * Usage example:
 * ```ts
 * <btrix-queue-exclusion-table
 *   .exclude=${this.crawlTemplate?.config?.exclude}
 * >
 * </btrix-queue-exclusion-table>
 * ```
 */
@localized()
export class QueueExclusionTable extends LiteElement {
  @property({ type: Array })
  exclude?: CrawlConfig["exclude"];

  private exclusions: Exclusion[] = [];

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("exclude") && this.exclude) {
      this.exclusions = this.exclude.map((str: any) => {
        const unescaped = str.replace(/\\/g, "");
        return {
          type: regexEscape(unescaped) === str ? "text" : "regex",
          value: unescaped,
        };
      });
    }
  }

  render() {
    return html`
      <table
        class="w-full leading-none border-separate"
        style="border-spacing: 0;"
      >
        <thead class="text-xs text-neutral-700">
          <tr class="text-left">
            <th class="font-normal px-2 pb-1 w-40">${msg("Exclusion Type")}</th>
            <th class="font-normal px-2 pb-1">${msg("Exclusion Value")}</th>
          </tr>
        </thead>
        <tbody class="text-neutral-600">
          ${this.exclusions.map(this.renderItem)}
        </tbody>
      </table>
    `;
  }

  private renderItem = (exclusion: Exclusion, index: number) => {
    let typeColClass = "";
    let valueColClass = "";

    if (index === 0) {
      typeColClass = " rounded-tl";
      valueColClass = " rounded-tr";
    } else if (index === this.exclusions.length - 1) {
      typeColClass = " border-b rounded-bl";
      valueColClass = " border-b rounded-br";
    }

    let typeLabel: string = exclusion.type;
    let value: any = exclusion.value;

    switch (exclusion.type) {
      case "regex":
        typeLabel = msg("Regex");
        value = staticHtml`<span class="regex">${unsafeStatic(
          new RegexColorize().colorizeText(exclusion.value)
        )}</span>`;
        break;
      case "text":
        typeLabel = msg("Matches Text");
        break;
      default:
        break;
    }

    return html`
      <tr class="even:bg-neutral-50 h-8">
        <td class="border-t border-x p-2 whitespace-nowrap${typeColClass}">
          ${typeLabel}
        </td>
        <td class="border-t border-r p-2 font-mono${valueColClass}">
          ${value}
        </td>
      </tr>
    `;
  };
}
