import { state, property } from "lit/decorators.js";
import { msg, localized, str } from "@lit/localize";
import debounce from "lodash/fp/debounce";

import LiteElement, { html } from "../utils/LiteElement";
import { regexEscape } from "../utils/string";

export type Exclusion = {
  type: "text" | "regex";
  value: string;
};

const MIN_LENGTH = 2;

/**
 * Crawl queue exclusion form
 *
 * Usage example:
 * ```ts
 * <btrix-queue-exclusion-form @on-input=${this.handleInput}>
 * </btrix-queue-exclusion-form>
 * ```
 *
 * @event on-regex { value: string; valid: boolean; }
 * @event submit
 */
@localized()
export class QueueExclusionForm extends LiteElement {
  @state()
  private selectValue: Exclusion["type"] = "text";

  @state()
  private inputValue = "";

  @state()
  private isInputValid = false;

  @state()
  private invalidRegexError = "";

  async willUpdate(changedProperties: Map<string, any>) {
    if (
      changedProperties.get("selectValue") ||
      (changedProperties.has("inputValue") &&
        changedProperties.get("inputValue") !== undefined)
    ) {
      this.invalidRegexError = "";
      this.checkInputValidity();

      await this.updateComplete;
      this.dispatchRegexEvent();
    }
  }

  render() {
    return html`
      <sl-form @sl-submit=${this.onSubmit}>
        <div class="flex">
          <div class="pr-1 flex-0 w-40">
            <sl-select
              name="excludeType"
              placeholder=${msg("Select Type")}
              size="small"
              .value=${this.selectValue}
              @sl-select=${(e: any) => {
                this.selectValue = e.target.value;
              }}
            >
              <sl-menu-item value="text">${msg("Matches Text")}</sl-menu-item>
              <sl-menu-item value="regex">${msg("Regex")}</sl-menu-item>
            </sl-select>
          </div>
          <div class="pl-1 flex-1 md:flex">
            <div class="flex-1 mb-2 md:mb-0 md:mr-2">
              <sl-input
                class=${this.invalidRegexError ? "invalid" : ""}
                name="excludeValue"
                size="small"
                autocomplete="off"
                minlength=${MIN_LENGTH}
                placeholder=${this.selectValue === "text"
                  ? "/skip-this-page"
                  : "example.com/skip.*"}
                .value=${this.inputValue}
                required
                @sl-input=${this.onInput}
              >
                ${this.invalidRegexError
                  ? html`
                      <div slot="help-text">
                        <p class="text-danger">
                          ${msg(
                            html`Regular Expression syntax error:
                              <code>${this.invalidRegexError}</code>`
                          )}
                        </p>
                        <p>
                          ${msg(
                            html`Please enter a valid constructor string
                              pattern. See
                              <a
                                class="underline hover:no-underline"
                                href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp"
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                                ><code>RegExp</code> docs</a
                              >.`
                          )}
                        </p>
                      </div>
                    `
                  : ""}
              </sl-input>
            </div>
            <div class="flex-0">
              <sl-button
                type="primary"
                size="small"
                submit
                ?disabled=${!this.isInputValid}
                >${msg("Add Exclusion")}</sl-button
              >
            </div>
          </div>
        </div>
      </sl-form>
    `;
  }

  private onInput = debounce(200)((e: any) => {
    this.inputValue = e.target.value;
  }) as any;

  private checkInputValidity(): void {
    let isValid = true;

    if (!this.inputValue || this.inputValue.length < MIN_LENGTH) {
      isValid = false;
    } else if (this.selectValue === "regex") {
      try {
        // Check if valid regex
        new RegExp(this.inputValue);
      } catch (err: any) {
        this.invalidRegexError = err.message;
        isValid = false;
      }
    }

    this.isInputValid = isValid;
  }

  private dispatchRegexEvent() {
    this.dispatchEvent(
      new CustomEvent("on-regex", {
        detail: {
          value:
            this.selectValue === "text"
              ? regexEscape(this.inputValue)
              : this.inputValue,
          valid: this.isInputValid,
        },
      })
    );
  }

  private onSubmit(event: any) {
    this.dispatchEvent(new CustomEvent("submit", event));
  }
}
