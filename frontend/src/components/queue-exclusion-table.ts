import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

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
  @property({ type: Array })
  exclusions: Exclusion[] = [];

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
        <tfoot>
          <tr>
            <td class="pt-3 pr-1 align-top">
              <sl-select
                name="type"
                placeholder=${msg("Select Type")}
                size="small"
                required
              >
                <sl-menu-item value="text">${msg("Matches Text")}</sl-menu-item>
                <sl-menu-item value="regex">${msg("Regex")}</sl-menu-item>
              </sl-select>
            </td>
            <td class="pt-3 pl-1 align-top md:flex">
              <div class="flex-1 mb-2 md:mb-0 md:mr-2">
                <sl-input name="value" size="small"> </sl-input>
              </div>
              <div class="flex-0">
                <sl-button type="primary" size="small" submit
                  >${msg("Add Exclusion")}</sl-button
                >
              </div>
            </td>
          </tr>
        </tfoot>
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
        <td class="border-t border-x p-2 whitespace-nowrap${typeColClass}">
          ${typeLabel}
        </td>
        <td class="border-t border-r p-2 font-mono${valueColClass}">
          ${exclusion.value}
        </td>
      </tr>
    `;
  };
}
