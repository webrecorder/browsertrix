import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { createParser } from "css-selector-parser";
import { html, type PropertyValues } from "lit";
import { customElement, property, queryAll } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import isEqual from "lodash/fp/isEqual";
import type { EmptyObject } from "type-fest";

import { BtrixElement } from "@/classes/BtrixElement";
import {
  DataGridRowsController,
  emptyItem,
} from "@/components/ui/data-grid/controllers/rows";
import type { SyntaxInput } from "@/components/ui/syntax-input";
import { FormControlController } from "@/controllers/formControl";
import type { BtrixChangeEvent } from "@/events/btrix-change";
import { FormControl } from "@/mixins/FormControl";
import type { SeedConfig } from "@/types/crawler";
import { tw } from "@/utils/tailwind";

export const SELECTOR_DELIMITER = "->";
const syntaxInputClasses = tw`flex-1 [--sl-input-border-color:transparent] [--sl-input-border-radius-medium:0]`;

type SelectorItem = {
  selector: string;
  attribute: string;
};

/**
 * Displays link selector crawl configuration in an editable table.
 *
 * @TODO Migrate to `<btrix-data-grid>`
 * https://github.com/webrecorder/browsertrix/issues/2543
 *
 * @attr name
 *
 * @fires btrix-change
 */
@customElement("btrix-link-selector-table")
@localized()
export class LinkSelectorTable extends FormControl(BtrixElement) {
  @property({ type: Array })
  selectors: SeedConfig["selectLinks"] = [];

  @property({ type: Boolean })
  editable = false;

  readonly #rowsController = new DataGridRowsController<SelectorItem>(this);

  @queryAll("btrix-syntax-input")
  private readonly syntaxInputs!: NodeListOf<SyntaxInput>;

  readonly #formControl = new FormControlController(this);

  // CSS parser should ideally match the parser used in browsertrix-crawler.
  // https://github.com/webrecorder/browsertrix-crawler/blob/v1.5.8/package.json#L23
  private readonly cssParser = createParser();

  // Selectors without empty items
  #value() {
    const selectLinks: string[] = [];

    this.#rowsController.rows.forEach((val) => {
      if (this.#rowsController.isEmpty(val)) return;
      selectLinks.push(`${val.selector}${SELECTOR_DELIMITER}${val.attribute}`);
    });

    return selectLinks;
  }

  // Selectors without missing fields
  public get value(): SeedConfig["selectLinks"] {
    const selectLinks: string[] = [];

    this.#rowsController.rows.forEach((val) => {
      if (this.#rowsController.isEmpty(val) || !val.selector || !val.attribute)
        return;
      selectLinks.push(`${val.selector}${SELECTOR_DELIMITER}${val.attribute}`);
    });

    return selectLinks;
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("selectors")) {
      const items = this.selectors.map((str) => {
        const [selector, attribute] = str.split(SELECTOR_DELIMITER);

        return { selector, attribute };
      });

      this.#rowsController.setItems(items);
    }
  }

  render() {
    return html`
      <btrix-table
        class="relative h-full w-full grid-cols-[1fr_1fr_min-content] rounded border"
      >
        <btrix-table-head
          class=${clsx(
            tw`rounded-t-[0.1875rem] border-b bg-slate-50 font-medium`,
            tw`[--btrix-table-cell-padding:var(--sl-spacing-x-small)]`,
          )}
        >
          <btrix-table-header-cell>
            ${msg("CSS Selector")}
          </btrix-table-header-cell>
          <btrix-table-header-cell class="border-l">
            ${msg("Link Attribute")}
          </btrix-table-header-cell>
          ${when(
            this.editable,
            () => html`
              <btrix-table-header-cell class="border-l">
                <span class="sr-only">${msg("Row actions")}</span>
              </btrix-table-header-cell>
            `,
          )}
        </btrix-table-head>
        <btrix-table-body class="overflow-auto">
          ${this.#rowsController.renderRows(this.row)}
        </btrix-table-body>
      </btrix-table>

      ${when(
        this.editable,
        () => html`
          <sl-button
            class="mt-1 w-full"
            @click=${() => {
              this.#rowsController.addRows(emptyItem);
            }}
          >
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            <span class="text-neutral-600">${msg("Add More")}</span>
          </sl-button>
        `,
      )}
    `;
  }

  private readonly row = (
    { id, item }: { id: string; item: SelectorItem | EmptyObject },
    i: number,
  ) => {
    let sel = "";
    let attr = "";

    if (!this.#rowsController.isEmpty(item)) {
      sel = item.selector;
      attr = item.attribute;
    }

    return html`
      <btrix-table-row class=${i > 0 ? "border-t" : ""}>
        <btrix-table-cell class=${clsx(this.editable && tw`p-0.5`)}>
          ${when(
            this.editable,
            () => html`
              <btrix-syntax-input
                class=${syntaxInputClasses}
                value=${sel}
                language="css"
                placeholder=${msg("Enter selector")}
                ?required=${Boolean(attr)}
                @btrix-change=${(e: BtrixChangeEvent<typeof sel>) => {
                  e.stopPropagation();

                  const el = e.target as SyntaxInput;
                  const value = e.detail.value.trim();

                  this.validateValue(
                    {
                      input: el,
                      value,

                      validationMessage: msg(
                        "Please enter a valid CSS selector",
                      ),
                    },
                    () => {
                      this.cssParser(value);
                    },
                  );

                  this.#rowsController.updateItem(id, {
                    selector: value,
                    attribute: attr,
                  });
                  void this.dispatchChange();
                }}
              >
              </btrix-syntax-input>
            `,
            () =>
              html`<btrix-code
                class="m-2"
                value=${sel}
                language="css"
              ></btrix-code>`,
          )}
        </btrix-table-cell>
        <btrix-table-cell
          class=${clsx(tw`border-l`, this.editable && tw`p-0.5`)}
        >
          ${when(
            this.editable,
            () => html`
              <btrix-syntax-input
                class=${syntaxInputClasses}
                value=${attr}
                language="xml"
                placeholder=${msg("Enter attribute")}
                ?required=${Boolean(sel)}
                @btrix-change=${(e: BtrixChangeEvent<typeof attr>) => {
                  e.stopPropagation();

                  const el = e.target as SyntaxInput;
                  const value = e.detail.value.trim();

                  this.validateValue(
                    {
                      input: el,
                      value,

                      validationMessage: msg(
                        "Please enter a valid HTML attribute",
                      ),
                    },
                    () => {
                      document.createElement("a").setAttribute(value, "x-test");
                    },
                  );

                  this.#rowsController.updateItem(id, {
                    selector: sel,
                    attribute: value,
                  });
                  void this.dispatchChange();
                }}
              >
              </btrix-syntax-input>
            `,
            () =>
              html`<btrix-code
                class="m-2"
                value=${attr}
                language="css"
              ></btrix-code>`,
          )}
        </btrix-table-cell>
        ${when(
          this.editable,
          () => html`
            <btrix-table-cell class="border-l">
              <sl-tooltip content=${msg("Remove")} hoist placement="bottom">
                <sl-icon-button
                  label=${msg("Remove exclusion")}
                  class="text-base hover:text-danger"
                  name="trash3"
                  @click=${async () => {
                    this.#rowsController.removeRow(id);
                    await this.updateValidity();
                    void this.dispatchChange();
                  }}
                ></sl-icon-button>
              </sl-tooltip>
            </btrix-table-cell>
          `,
        )}
      </btrix-table-row>
    `;
  };

  private validateValue(
    {
      input,
      value,
      validationMessage,
    }: {
      input: SyntaxInput;
      value: string;
      validationMessage: string;
    },
    validate: () => void,
  ) {
    if (!value) {
      if (input.validity.valueMissing) {
        this.setValidity(input.validity, input.validationMessage, input);
      }
      return;
    }

    try {
      validate();

      input.setCustomValidity("");
      void this.updateValidity();
    } catch {
      input.setCustomValidity(validationMessage);
      this.setValidity(input.validity, input.validationMessage, input);
    }
  }

  private async anyInvalidInput(): Promise<SyntaxInput | null> {
    await this.updateComplete;

    // Check if any others are invalid
    let invalidInput: SyntaxInput | null = null;
    let i = 0;

    while (!invalidInput && i < this.syntaxInputs.length) {
      const input = this.syntaxInputs[i];

      await input;

      if (!input.validity.valid) {
        invalidInput = input;
      }
      i++;
    }

    return invalidInput;
  }

  private async updateValidity() {
    const invalidInput = await this.anyInvalidInput();

    if (invalidInput) {
      this.setValidity(
        invalidInput.validity,
        invalidInput.validationMessage,
        invalidInput,
      );
    } else {
      this.setValidity({});
    }
  }

  private async dispatchChange() {
    await this.anyInvalidInput();

    if (isEqual(this.selectors, this.#value)) return;

    this.dispatchEvent(
      new CustomEvent("btrix-change", {
        detail: {
          value: this.#value,
        },
      }),
    );
  }
}
