import { state, property } from "lit/decorators.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import { msg, localized, str } from "@lit/localize";
import RegexColorize from "regex-colorize";

import type { CrawlConfig } from "../pages/archive/types";
import LiteElement, { html } from "../utils/LiteElement";
import { regexEscape } from "../utils/string";
import type { Exclusion } from "./queue-exclusion-form";

export type ExclusionChangeEvent = CustomEvent<{
  index: number;
  regex: string;
}>;

export type ExclusionRemoveEvent = CustomEvent<{
  index: number;
  regex: string;
}>;

const MIN_LENGTH = 2;

function formatValue(type: Exclusion["type"], value: Exclusion["value"]) {
  return type == "text" ? regexEscape(value) : value;
}

/**
 * Crawl queue exclusion table
 *
 * Usage example:
 * ```ts
 * <btrix-queue-exclusion-table
 *   .exclusions=${this.crawlTemplate.config.exclude}
 * >
 * </btrix-queue-exclusion-table>
 * ```
 *
 * @event on-change ExclusionChangeEvent
 * @event on-remove ExclusionRemoveEvent
 */
@localized()
export class QueueExclusionTable extends LiteElement {
  @property({ type: Array })
  exclusions?: CrawlConfig["exclude"];

  @property({ type: Number })
  pageSize: number = 5;

  @property({ type: Boolean })
  editable = false;

  @property({ type: Boolean })
  removable = false;

  @state()
  private results: Exclusion[] = [];

  @state()
  private page: number = 1;

  @state()
  private exclusionToRemove?: string;

  private get total() {
    return this.exclusions?.length;
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has("exclusions") && this.exclusions) {
      this.exclusionToRemove = undefined;

      const prevVal = changedProperties.get("exclusions");
      if (prevVal) {
        const prevTotal = prevVal.length;
        const lastPage = Math.ceil(this.total! / this.pageSize);
        if (this.total! < prevTotal) {
          this.page = Math.min(this.page, lastPage);
        } else if (this.total! > prevTotal) {
          this.page = lastPage;
        }
      }

      this.updatePageResults();
    } else if (changedProperties.has("page")) {
      this.updatePageResults();
    }
  }

  private updatePageResults() {
    if (!this.exclusions) return;

    this.results = this.exclusions
      .slice((this.page - 1) * this.pageSize, this.page * this.pageSize)
      .map((str: any) => {
        const unescaped = str.replace(/\\/g, "");
        return {
          type: regexEscape(unescaped) === str ? "text" : "regex",
          value: unescaped,
        };
      });
  }

  render() {
    const [typeColClass, valueColClass, actionColClass] =
      this.getColumnClassNames(0, this.results.length, true);

    return html`
      <style>
        btrix-queue-exclusion-table sl-input {
          --sl-input-border-radius-medium: 0;
          --sl-input-font-family: var(--sl-font-mono);
          --sl-input-spacing-medium: var(--sl-spacing-small);
        }

        btrix-queue-exclusion-table sl-input:not([invalid]) {
          --sl-input-border-width: 0;
        }
      </style>
      <btrix-details open disabled>
        <h4 slot="title">${msg("Exclusions")}</h4>
        <div slot="summary-description">
          ${this.total && this.total > this.pageSize
            ? html`<btrix-pagination
                page=${this.page}
                size=${this.pageSize}
                totalCount=${this.total}
                @page-change=${(e: CustomEvent) => {
                  this.page = e.detail.page;
                }}
              >
              </btrix-pagination>`
            : ""}
        </div>
        <table
          class="w-full leading-none border-separate"
          style="border-spacing: 0;"
        >
          <thead class="text-xs font-mono text-neutral-600 uppercase">
            <tr class="h-10 text-left">
              <th class="font-normal px-2 w-40 bg-slate-50 ${typeColClass}">
                ${msg("Exclusion Type")}
              </th>
              <th class="font-normal px-2 bg-slate-50 ${valueColClass}">
                ${msg("Exclusion Value")}
              </th>
              <th class="font-normal px-2 w-10 bg-slate-50 ${actionColClass}">
                <span class="sr-only">Row actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            ${this.results.map(this.renderItem)}
          </tbody>
        </table>
      </btrix-details>
    `;
  }

  private renderItem = (
    exclusion: Exclusion,
    index: number,
    arr: Exclusion[]
  ) => {
    const [typeColClass, valueColClass, actionColClass] =
      this.getColumnClassNames(index + 1, arr.length);

    return html`
      <tr
        class="h-10 ${this.exclusionToRemove === exclusion.value
          ? "text-neutral-200"
          : "text-neutral-600"}"
      >
        <td class="whitespace-nowrap ${typeColClass}">
          ${this.renderType({ exclusion, index })}
        </td>
        <td class="font-mono ${valueColClass}">
          ${this.renderValue({ exclusion, index })}
        </td>
        <td class="text-[1rem] text-center ${actionColClass}">
          <btrix-icon-button
            name="trash3"
            @click=${() => this.removeExclusion(exclusion, index)}
          ></btrix-icon-button>
        </td>
      </tr>
    `;
  };

  private renderType({
    exclusion,
    index,
  }: {
    exclusion: Exclusion;
    index: number;
  }) {
    let typeLabel: string = exclusion.type;

    if (exclusion.type === "text") typeLabel = msg("Matches Text");
    if (exclusion.type === "regex") typeLabel = msg("Regex");

    if (this.editable) {
      return html`
        <sl-select
          placeholder=${msg("Select Type")}
          size="small"
          .value=${exclusion.type}
          @sl-hide=${this.stopProp}
          @sl-after-hide=${this.stopProp}
          @sl-select=${(e: Event) => {
            this.updateExclusion({
              type: (e.target as HTMLSelectElement).value as Exclusion["type"],
              value: exclusion.value,
              index,
            });
          }}
          hoist
        >
          <sl-menu-item value="text">${msg("Matches Text")}</sl-menu-item>
          <sl-menu-item value="regex">${msg("Regex")}</sl-menu-item>
        </sl-select>
      `;
    }

    return typeLabel;
  }

  private renderValue({
    exclusion,
    index,
  }: {
    exclusion: Exclusion;
    index: number;
  }) {
    let value: any = exclusion.value;

    if (this.editable) {
      return html`
        <sl-input
          name="exclusion-${index}"
          placeholder=${msg("Enter value")}
          class="m-0"
          value=${exclusion.value}
          autocomplete="off"
          autocorrect="off"
          minlength=${MIN_LENGTH}
          clearable
          @sl-clear=${() => {
            this.updateExclusion({
              type: exclusion.type,
              value: "",
              index,
            });
          }}
          @sl-input=${(e: CustomEvent) => {
            const inputElem = e.target as HTMLInputElement & { invalid: any };
            const values = this.getCurrentValues(e);
            const params = {
              type: values.type || exclusion.type,
              value: values.value,
              index,
            };

            const validityMessage = this.getInputValidity(params) || "";

            inputElem.classList.remove("invalid");
            inputElem.invalid = Boolean(validityMessage);
            inputElem.setCustomValidity(validityMessage);
          }}
          @sl-change=${(e: CustomEvent) => {
            const inputElem = e.target as HTMLInputElement & { invalid: any };
            const values = this.getCurrentValues(e);
            const params = {
              type: values.type || exclusion.type,
              value: values.value,
              index,
            };

            if (inputElem.invalid) {
              inputElem.classList.add("invalid");
            }
            inputElem.reportValidity();

            this.updateExclusion(params);
          }}
        ></sl-input>
      `;
    }

    if (exclusion.type === "regex") {
      value = staticHtml`<span class="regex">${unsafeStatic(
        new RegexColorize().colorizeText(exclusion.value)
      )}</span>`;
    }

    return value;
  }

  private getColumnClassNames(
    index: number,
    count: number,
    isHeader?: boolean
  ) {
    let typeColClass = "border-t border-x";
    let valueColClass = "border-t border-r";
    let actionColClass = "border-t border-r";

    if (index === 0) {
      typeColClass += " rounded-tl";

      if (this.removable) {
        actionColClass += " rounded-tr";
      } else {
        valueColClass += " rounded-tr";
      }
    }

    if (index === count) {
      typeColClass += " border-b rounded-bl";

      if (this.removable) {
        valueColClass += " border-b";
        actionColClass += " border-b rounded-br";
      } else {
        valueColClass += " border-b rounded-br";
      }
    }

    if (!this.removable) {
      actionColClass += " hidden";
    }

    if (!isHeader) {
      if (this.editable) {
        typeColClass += " px-[3px]";
      } else {
        typeColClass += " py-2 px-3";
        valueColClass += " p-2";
      }
    }

    return [typeColClass, valueColClass, actionColClass];
  }

  private getCurrentValues(e: CustomEvent) {
    const inputElem = e.target as HTMLInputElement & { invalid: any };
    // Get latest exclusion type value from select
    const typeSelectElem = inputElem.closest("tr")?.querySelector("sl-select");
    const exclusionType = typeSelectElem?.value;
    return {
      type: exclusionType as Exclusion["type"],
      value: inputElem.value,
    };
  }

  private getInputValidity({
    type,
    value,
  }: {
    type: Exclusion["type"];
    value: Exclusion["value"];
    index: number;
  }): string | void {
    if (!value) return;

    if (value.length < MIN_LENGTH) {
      return msg(str`Please enter ${MIN_LENGTH} or more characters`);
    }

    if (this.exclusions?.includes(formatValue(type, value))) {
      return msg("Exclusion already exists. Please remove to continue");
    }

    if (type === "regex") {
      try {
        // Check if valid regex
        new RegExp(value);
      } catch (err: any) {
        return msg(
          "Please enter a valid Regular Expression constructor pattern"
        );
      }
    }
  }

  private removeExclusion({ value, type }: Exclusion, index: number) {
    this.exclusionToRemove = value;

    this.dispatchEvent(
      new CustomEvent("on-remove", {
        detail: {
          regex: formatValue(type, value),
          index,
        },
      }) as ExclusionRemoveEvent
    );
  }

  private updateExclusion({
    type,
    value,
    index,
  }: {
    type: Exclusion["type"];
    value: Exclusion["value"];
    index: number;
  }) {
    this.dispatchEvent(
      new CustomEvent("on-change", {
        detail: {
          index,
          regex: formatValue(type, value),
        },
      }) as ExclusionChangeEvent
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
