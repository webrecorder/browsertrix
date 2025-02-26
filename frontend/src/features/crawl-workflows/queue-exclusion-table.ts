import { localized, msg, str } from "@lit/localize";
import type { SlInput, SlSelect } from "@shoelace-style/shoelace";
import clsx from "clsx";
import { css, html, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { when } from "lit/directives/when.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import RegexColorize from "regex-colorize";

import type { Exclusion } from "./queue-exclusion-form";

import { TailwindElement } from "@/classes/TailwindElement";
import { type PageChangeEvent } from "@/components/ui/pagination";
import type { SeedConfig } from "@/pages/org/types";
import { regexEscape, regexUnescape } from "@/utils/string";
import { tw } from "@/utils/tailwind";

export type ExclusionChangeEventDetail = {
  index: number;
  regex: string;
  valid?: boolean;
};

export type ExclusionChangeEvent = CustomEvent<ExclusionChangeEventDetail>;

export type ExclusionRemoveEvent = CustomEvent<ExclusionChangeEventDetail>;

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
 *   .exclusions=${this.workflow.config.exclude}
 * >
 * </btrix-queue-exclusion-table>
 * ```
 *
 * @TODO Refactor to always be uncontrolled field
 * so that callers don't need to maintain their
 * own exclusions state
 * @TODO Return value when using shoelace serialize
 *
 * @fires btrix-change ExclusionChangeEvent
 * @fires btrix-remove ExclusionRemoveEvent
 */
@customElement("btrix-queue-exclusion-table")
@localized()
export class QueueExclusionTable extends TailwindElement {
  static styles = css`
    sl-input:not([data-invalid]) {
      --sl-input-border-width: 0;
    }
  `;

  @property({ type: Array })
  exclusions?: SeedConfig["exclude"];

  /**
   * @deprecated Refactor to always be uncontrolled
   * field so that callers don't need to maintain their
   * own exclusions state
   */
  @property({ type: Boolean, noAccessor: true })
  uncontrolled = false;

  // TODO switch to LitElement & slotted label
  @property({ type: String })
  label?: string;
  @property({ type: String })
  labelClassName?: string;

  @property({ type: Number })
  pageSize = 5;

  @property({ type: Boolean })
  editable = false;

  @property({ type: Boolean })
  removable = false;

  @state()
  private results: Exclusion[] = [];

  @state()
  private page = parseInt(
    new URLSearchParams(location.search).get("page") ?? "1",
  );

  @state()
  private exclusionToRemove?: string;

  @queryAll("sl-input")
  private readonly inputs!: NodeListOf<SlInput>;

  public reportValidity() {
    this.inputs.forEach((input) => {
      input.reportValidity();
    });
  }

  public checkValidity() {
    return ![...this.inputs].some((input) => !input.validity.valid);
  }

  private get total() {
    return this.exclusions?.length;
  }

  willUpdate(changedProperties: PropertyValues<this> & Map<string, unknown>) {
    if (changedProperties.has("exclusions") && this.exclusions) {
      if (
        changedProperties.get("exclusions")?.toString() ===
        this.exclusions.toString()
      ) {
        // Check list equality
        return;
      }
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
    } else if (changedProperties.get("page") && this.page) {
      this.updatePageResults();
    }
  }

  firstUpdated() {
    if (this.exclusions) {
      this.updatePageResults();
    }
  }

  private updatePageResults() {
    if (!this.exclusions) return;

    this.results = this.exclusions
      .slice((this.page - 1) * this.pageSize, this.page * this.pageSize)
      .map((str: string) => {
        // if escaped version of string, with '\' removed matches string, then consider it
        // to be matching text, otherwise, regex
        const isText = regexEscape(str.replace(/\\/g, "")) === str;
        return {
          type: isText ? "text" : "regex",
          value: isText ? regexUnescape(str) : str,
        };
      });
  }

  render() {
    const [typeColClass, valueColClass, actionColClass] =
      this.getColumnClassNames(0, this.results.length, true);

    return html`
      <div class="mb-2 flex items-center justify-between leading-tight">
        <div class=${ifDefined(this.labelClassName)}>
          ${this.label ?? msg("Exclusions")}
        </div>
        ${this.total && this.total > this.pageSize
          ? html`<btrix-pagination
              page=${this.page}
              size=${this.pageSize}
              totalCount=${this.total}
              compact
              @page-change=${(e: PageChangeEvent) => {
                this.page = e.detail.page;
              }}
            >
            </btrix-pagination>`
          : ""}
      </div>
      <table
        class="w-full border-separate leading-none"
        style="border-spacing: 0;"
      >
        <thead class="text-xs text-neutral-600">
          <tr class="h-10 text-left">
            <th class="${typeColClass} w-40 bg-slate-50 px-2 font-normal">
              ${msg("Exclusion Type")}
            </th>
            <th class="${valueColClass} bg-slate-50 px-2 font-normal">
              ${msg("Exclusion Value")}
            </th>
            <th class="${actionColClass} w-10 bg-slate-50 px-2 font-normal">
              <span class="sr-only">${msg("Row actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody class="align-top">
          ${this.results.map(this.renderItem)}
        </tbody>
      </table>
      ${when(
        this.editable,
        () => html`
          <sl-button class="mt-1 w-full" @click=${() => void this.addInput()}>
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            <span class="text-neutral-600">${msg("Add More")}</span>
          </sl-button>
        `,
      )}
    `;
  }

  private readonly renderItem = (
    exclusion: Exclusion,
    pageIndex: number,
    arr: Exclusion[],
  ) => {
    const index = (this.page - 1) * this.pageSize + pageIndex;
    const [typeColClass, valueColClass, actionColClass] =
      this.getColumnClassNames(pageIndex + 1, arr.length);

    return html`
      <tr
        class="${this.exclusionToRemove === exclusion.value
          ? "text-neutral-200"
          : "text-neutral-600"}"
      >
        <td class="${typeColClass} whitespace-nowrap">
          ${this.renderType({ exclusion, index })}
        </td>
        <td class="${valueColClass}">
          ${this.renderValue({ exclusion, index })}
        </td>
        <td class="${actionColClass} text-center text-[1rem]">
          <sl-icon-button
            label=${msg("Remove exclusion")}
            class="text-base hover:text-danger"
            name="trash3"
            @click=${() => {
              if (this.exclusions?.length === 1) {
                void this.updateExclusion({
                  type: exclusion.type,
                  value: "",
                  index,
                });
              } else {
                void this.removeExclusion(exclusion, index);
              }
            }}
          ></sl-icon-button>
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
          class="my-1"
          size="small"
          value=${exclusion.type}
          @sl-hide=${this.stopProp}
          @sl-after-hide=${this.stopProp}
          @sl-change=${(e: Event) => {
            const inputElem = (e.target as SlSelect)
              .closest("tr")
              ?.querySelector("sl-input");

            if (inputElem) {
              this.checkInputValidity(inputElem);
              this.reportInputValidity(inputElem);
            } else {
              console.debug("no inputElem for ", e.target);
            }

            void this.updateExclusion({
              type: (e.target as HTMLSelectElement).value as Exclusion["type"],
              value: exclusion.value,
              index,
            });
          }}
          hoist
        >
          <sl-option value="text">${msg("Matches Text")}</sl-option>
          <sl-option value="regex">${msg("Regex")}</sl-option>
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
    let value: string | TemplateResult = exclusion.value;

    if (this.editable) {
      return html`
        <sl-input
          name="exclusion-${index}"
          placeholder=${msg("Enter value")}
          class=${clsx(
            tw`m-0`,
            tw`[--sl-input-border-radius-medium:0] [--sl-input-spacing-medium:var(--sl-spacing-small)]`,
            tw`part-[form-control-help-text]:mx-1 part-[form-control-help-text]:mb-1`,
            exclusion.type === "regex" &&
              tw`[--sl-input-font-family:var(--sl-font-mono)]`,
          )}
          value=${exclusion.value}
          autocomplete="off"
          autocorrect="off"
          minlength=${MIN_LENGTH}
          @sl-clear=${() => {
            void this.updateExclusion({
              type: exclusion.type,
              value: "",
              index,
            });
          }}
          @sl-input=${(e: CustomEvent) => {
            const inputElem = e.target as SlInput;

            this.checkInputValidity(inputElem);
            this.checkSiblingRowValidity(e);
          }}
          @sl-change=${(e: CustomEvent) => {
            const inputElem = e.target as SlInput;

            this.reportInputValidity(inputElem);

            const values = this.getCurrentValues(inputElem);
            const params = {
              type: values.type || exclusion.type,
              value: values.value,
              index,
            };

            void this.updateExclusion(params);
          }}
        ></sl-input>
      `;
    }

    if (exclusion.type === "regex") {
      value = staticHtml`<span class="regex ${tw`font-mono`}">${unsafeStatic(
        new RegexColorize().colorizeText(exclusion.value) as string,
      )}</span>`;
    }

    return value;
  }

  private checkInputValidity(inputElem: SlInput) {
    const validityMessage = this.getInputValidity(inputElem) || "";

    inputElem.setCustomValidity(validityMessage);

    if (inputElem.classList.contains("invalid")) {
      // Update help text on change
      this.reportInputValidity(inputElem);
    }
  }

  private reportInputValidity(inputElem: SlInput) {
    if (inputElem.validationMessage) {
      inputElem.classList.add("invalid");
    } else {
      inputElem.classList.remove("invalid");
    }

    inputElem.helpText = inputElem.validationMessage;
  }

  private getColumnClassNames(
    index: number,
    count: number,
    isHeader?: boolean,
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

  private getCurrentValues(inputElem: SlInput) {
    // Get latest exclusion type value from select
    const typeSelectElem = inputElem.closest("tr")?.querySelector("sl-select");
    const exclusionType = typeSelectElem?.value;
    return {
      type: exclusionType as Exclusion["type"] | undefined,
      value: inputElem.value,
    };
  }

  private getInputDuplicateValidity(inputElem: SlInput) {
    const siblingElems = inputElem
      .closest("table")
      ?.querySelectorAll(`sl-input:not([name="${inputElem.name}"])`);
    if (!siblingElems) {
      console.debug("getInputDuplicateValidity no matching siblings");
      return;
    }
    const siblingValues = Array.from(siblingElems).map(
      (elem) => (elem as SlInput).value,
    );
    const { type, value } = this.getCurrentValues(inputElem);
    const formattedValue = formatValue(type!, value);
    if (siblingValues.includes(formattedValue)) {
      return msg("Exclusion already exists. Please edit or remove to continue");
    }
  }

  private getInputValidity(inputElem: SlInput): string | void {
    const { type, value } = this.getCurrentValues(inputElem);
    if (!value) return;

    const validityMessage = this.getValidityMessage({ type, value });

    if (validityMessage) return validityMessage;

    return this.getInputDuplicateValidity(inputElem);
  }

  private getValidityMessage({
    type,
    value,
  }: {
    type?: Exclusion["type"];
    value: string;
  }) {
    if (value.length < MIN_LENGTH) {
      return msg(str`Please enter ${MIN_LENGTH} or more characters`);
    }

    if (type === "regex") {
      try {
        // Check if valid regex
        new RegExp(value);
      } catch (err) {
        return msg("Please enter a valid regular expression");
      }
    }
  }

  private checkSiblingRowValidity(e: CustomEvent) {
    // Check if any sibling inputs are now valid
    // after fixing duplicate values
    const inputElem = e.target as HTMLInputElement;
    const table = inputElem.closest("table")!;
    Array.from(table.querySelectorAll("sl-input[data-invalid]")).map((elem) => {
      if (elem !== inputElem) {
        const validityMessage =
          this.getInputDuplicateValidity(elem as SlInput) || "";
        (elem as SlInput).setCustomValidity(validityMessage);
      }
    });
  }

  private async removeExclusion({ value, type }: Exclusion, index: number) {
    this.exclusionToRemove = value;
    const exclusions = this.exclusions || [];
    const regex = formatValue(type, value);

    if (this.uncontrolled) {
      this.exclusions = [
        ...exclusions.slice(0, index),
        ...exclusions.slice(index + 1),
      ];
    }

    await this.updateComplete;

    let valid: boolean | undefined;

    if (value.length) {
      valid = !this.getValidityMessage({ type, value });
    }

    this.dispatchEvent(
      new CustomEvent<ExclusionChangeEventDetail>("btrix-remove", {
        detail: {
          index,
          regex,
          valid,
        },
      }) as ExclusionRemoveEvent,
    );
  }

  private async addInput() {
    await this.updateExclusion({
      type: "text",
      value: "",
      index: this.exclusions?.length || 0,
    });
  }

  private async updateExclusion({
    type,
    value,
    index,
  }: {
    type: Exclusion["type"];
    value: Exclusion["value"];
    index: number;
  }) {
    const exclusions = this.exclusions || [];
    const regex = formatValue(type, value);

    if (this.uncontrolled) {
      this.exclusions = [
        ...exclusions.slice(0, index),
        regex,
        ...exclusions.slice(index + 1),
      ];
    }

    await this.updateComplete;

    let valid: boolean | undefined;

    if (value.length) {
      valid = !this.getValidityMessage({ type, value });
    }

    this.dispatchEvent(
      new CustomEvent<ExclusionChangeEventDetail>("btrix-change", {
        detail: {
          index,
          regex,
          valid,
        },
      }),
    );
  }

  /**
   * Stop propagation of sl-select events.
   * Prevents bug where sl-dialog closes when dropdown closes
   * https://github.com/shoelace-style/shoelace/issues/170
   */
  private stopProp(e: CustomEvent) {
    e.stopPropagation();
  }
}
