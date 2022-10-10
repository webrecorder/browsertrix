import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";

import type { CrawlConfig } from "../pages/archive/types";
import LiteElement, { html } from "../utils/LiteElement";

const MIN_LENGTH = 2;

/**
 * Crawl queue exclusion form
 */
@localized()
export class QueueExclusionForm extends LiteElement {
  @state()
  private selectValue = "text";

  @state()
  private inputValue = "";

  render() {
    return html`
      <sl-form
        @sl-submit=${(e: CustomEvent) => {
          const { formData } = e.detail;
          console.log(
            formData.get("excludeType"),
            formData.get("excludeValue")
          );
        }}
      >
        <div class="flex">
          <div class="pt-3 pr-1 flex-0 w-40">
            <sl-select
              name="excludeType"
              placeholder=${msg("Select Type")}
              size="small"
              .value=${this.selectValue}
              @sl-select=${(e: any) => (this.selectValue = e.target.value)}
            >
              <sl-menu-item value="text">${msg("Matches Text")}</sl-menu-item>
              <sl-menu-item value="regex">${msg("Regex")}</sl-menu-item>
            </sl-select>
          </div>
          <div class="pt-3 pl-1 flex-1 md:flex">
            <div class="flex-1 mb-2 md:mb-0 md:mr-2">
              <sl-input
                name="excludeValue"
                size="small"
                autocomplete="off"
                minlength=${MIN_LENGTH}
                placeholder=${this.selectValue === "text"
                  ? "/skip-this-page"
                  : "example.com/skip.*"}
                .value=${this.inputValue}
                required
                @sl-input=${(e: any) => (this.inputValue = e.target.value)}
              >
              </sl-input>
            </div>
            <div class="flex-0">
              <sl-button
                type="primary"
                size="small"
                submit
                ?disabled=${!this.inputValue ||
                this.inputValue.length < MIN_LENGTH}
                >${msg("Add Exclusion")}</sl-button
              >
            </div>
          </div>
        </div>
      </sl-form>
    `;
  }
}
