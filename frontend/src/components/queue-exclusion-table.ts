import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { CrawlConfig } from "../pages/archive/types";
import LiteElement, { html } from "../utils/LiteElement";

type Exclusion = {
  type: "text" | "regex";
  value: string;
};

/**
 * Crawl queue exclusion table
 */
@localized()
export class QueueExclusionTable extends LiteElement {
  /**
   * Escape string to use as regex
   * From https://github.com/tc39/proposal-regex-escaping/blob/main/polyfill.js#L3
   */
  static escape(s: any) {
    return String(s).replace(/[\\^$*+?.()|[\]{}]/g, "\\$&");
  }

  @property({ type: Array })
  exclude?: CrawlConfig["exclude"];

  private exclusions: Exclusion[] = [];

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("exclude") && this.exclude) {
      this.exclusions = this.exclude.map((str: any) => ({
        type: QueueExclusionTable.escape(str) === str ? "text" : "regex",
        value: str,
      }));
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
        <tbody class="text-neutral-500">
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

    switch (exclusion.type) {
      case "regex":
        typeLabel = msg("Regex");
        break;
      case "text":
        typeLabel = msg("Matches Text");
        break;
      default:
        break;
    }

    return html`
      <tr class="even:bg-neutral-50">
        <td
          class="border-t border-x p-2 whitespace-nowrap bg-neutral-0${typeColClass}"
        >
          ${typeLabel}
        </td>
        <td class="border-t border-r p-2 font-mono${valueColClass}">
          ${exclusion.value}
        </td>
      </tr>
    `;
  };
}
