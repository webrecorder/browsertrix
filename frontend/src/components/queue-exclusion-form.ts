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
  @property({ type: Boolean })
  isSubmitting = false;

  @property({ type: String })
  fieldErrorMessage = "";

  @state()
  private selectValue: Exclusion["type"] = "text";

  @state()
  private inputValue = "";

  @state()
  private isRegexInvalid = false;

  async willUpdate(changedProperties: Map<string, any>) {
    if (
      changedProperties.get("selectValue") ||
      (changedProperties.has("inputValue") &&
        changedProperties.get("inputValue") !== undefined)
    ) {
      this.fieldErrorMessage = "";
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
          <div class="pl-1 flex-1 flex">
            <div class="flex-1 mr-1 mb-2 md:mb-0">
              <sl-input
                class=${this.fieldErrorMessage ? "invalid" : ""}
                name="excludeValue"
                size="small"
                autocomplete="off"
                minlength=${MIN_LENGTH}
                placeholder=${this.selectValue === "text"
                  ? "/skip-this-page"
                  : "example.com/skip.*"}
                .value=${this.inputValue}
                ?disabled=${this.isSubmitting}
                required
                @sl-input=${this.onInput}
              >
                ${this.fieldErrorMessage
                  ? html`
                      <div slot="help-text">
                        ${this.isRegexInvalid
                          ? html`
                              <p class="text-danger">
                                ${msg(
                                  html`Regular Expression syntax error:
                                    <code>${this.fieldErrorMessage}</code>`
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
                            `
                          : html`<p class="text-danger">
                              ${this.fieldErrorMessage}
                            </p>`}
                      </div>
                    `
                  : ""}
              </sl-input>
            </div>
            <div class="flex-0 w-9 pt-1 text-center">
              <btrix-icon-button
                type="submit"
                variant="primary"
                name="plus-lg"
                ?disabled=${this.isRegexInvalid || this.isSubmitting}
                ?loading=${this.isSubmitting}
              >
              </btrix-icon-button>
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
        this.fieldErrorMessage = err.message;
        isValid = false;
      }
    }

    this.isRegexInvalid = !isValid;
  }

  private dispatchRegexEvent() {
    this.dispatchEvent(
      new CustomEvent("on-regex", {
        detail: {
          value:
            this.selectValue === "text"
              ? regexEscape(this.inputValue)
              : this.inputValue,
          valid: !this.isRegexInvalid,
        },
      })
    );
  }

  private onSubmit(event: CustomEvent) {
    this.dispatchEvent(
      new CustomEvent("submit", {
        detail: {
          formData: event.detail.formData,
          onSuccess: () => {
            this.inputValue = "";
          },
        },
      })
    );
  }
}
