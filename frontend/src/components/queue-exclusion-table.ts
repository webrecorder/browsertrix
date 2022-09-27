import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import LiteElement, { html } from "../utils/LiteElement";

/**
 * Crawl queue exclusion table
 */
@localized()
export class QueueExclusionTable extends LiteElement {
  render() {
    return html`
      <table class="leading-none border-separate border-spacing-0">
        <thead class="text-xs text-neutral-700">
          <tr class="text-left">
            <th class="font-normal px-2 pb-1">${msg("Exclusion Type")}</th>
            <th class="font-normal px-2 pb-1 w-full">
              ${msg("Exclusion Text")}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr class="even:bg-neutral-50">
            <td class="border-t border-x rounded-tl p-2">Matches Text</td>
            <td class="border-t border-r rounded-tr p-2">
              https://example.com/login/
            </td>
          </tr>
          <tr class="even:bg-neutral-50">
            <td class="border-t border-x p-2">Matches Text</td>
            <td class="border-t border-r p-2">/users/</td>
          </tr>
          <tr class="even:bg-neutral-50">
            <td class="border-y border-x rounded-bl p-2">Regex</td>
            <td class="border-y border-r rounded-br p-2">/\\users/</td>
          </tr>
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
}
