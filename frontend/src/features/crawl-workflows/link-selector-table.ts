import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { createParser } from "css-selector-parser";
import { html, type PropertyValues } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { when } from "lit/directives/when.js";
import { nanoid } from "nanoid";

import { BtrixElement } from "@/classes/BtrixElement";
import type { SyntaxInput } from "@/components/ui/syntax-input";
import type { SeedConfig } from "@/types/crawler";
import { tw } from "@/utils/tailwind";

export const SELECTOR_DELIMITER = "->" as const;
const emptyCells = ["", ""];
const syntaxInputClasses = tw`flex-1 [--sl-input-border-color:transparent] [--sl-input-border-radius-medium:0]`;

/**
 * @fires btrix-change
 */
@customElement("btrix-link-selector-table")
@localized()
export class LinkSelectorTable extends BtrixElement {
  @property({ type: Array })
  selectors: SeedConfig["selectLinks"] = [];

  @property({ type: Boolean })
  editable = false;

  @state()
  private rows: {
    id: string;
    cells: string[];
  }[] = [];

  @queryAll("btrix-syntax-input")
  private readonly syntaxInputs!: NodeListOf<SyntaxInput>;

  // CSS parser should ideally match the parser used in browsertrix-crawler.
  // https://github.com/webrecorder/browsertrix-crawler/blob/v1.5.8/package.json#L23
  private readonly cssParser = createParser();

  public get value(): SeedConfig["selectLinks"] {
    return this.rows
      .filter(({ cells }) => cells[0] || cells[1])
      .map(({ cells }) => cells.join(SELECTOR_DELIMITER));
  }

  public reportValidity() {
    let tableValid = true;

    this.syntaxInputs.forEach((input) => {
      const valid = input.reportValidity();

      if (!valid) {
        tableValid = valid;
      }
    });

    return tableValid;
  }

  public checkValidity() {
    let tableValid = true;

    this.syntaxInputs.forEach((input) => {
      const valid = input.checkValidity();

      if (!valid) {
        tableValid = valid;
      }
    });

    return tableValid;
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("selectors")) {
      this.rows = this.selectors.map((str) => ({
        id: nanoid(),
        cells: str.split(SELECTOR_DELIMITER),
      }));
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
            // TODO Refactor padding config https://github.com/webrecorder/browsertrix/issues/2497
            tw`[--btrix-cell-padding-bottom:var(--sl-spacing-x-small)] [--btrix-cell-padding-left:var(--sl-spacing-x-small)] [--btrix-cell-padding-right:var(--sl-spacing-x-small)] [--btrix-cell-padding-top:var(--sl-spacing-x-small)]`,
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
          ${repeat(this.rows, (row) => row.id, this.row)}
        </btrix-table-body>
      </btrix-table>

      ${when(
        this.editable,
        () => html`
          <sl-button
            class="mt-1 w-full"
            @click=${() =>
              void this.updateRows(
                {
                  id: nanoid(),
                  cells: emptyCells,
                },
                this.rows.length,
              )}
          >
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            <span class="text-neutral-600">${msg("Add More")}</span>
          </sl-button>
        `,
      )}
    `;
  }

  private readonly row = (
    { id, cells }: LinkSelectorTable["rows"][0],
    i: number,
  ) => {
    const [sel, attr] = cells;

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
                @sl-change=${(e: CustomEvent) => {
                  const el = e.currentTarget as SyntaxInput;
                  const value = el.input?.value.trim() || "";

                  void this.updateRows(
                    {
                      id,
                      cells: [value, attr],
                    },
                    i,
                  );

                  if (value) {
                    try {
                      // Validate selector
                      this.cssParser(value);
                    } catch {
                      el.setCustomValidity(
                        msg("Please enter a valid CSS selector"),
                      );
                    }
                  }
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
                @sl-change=${(e: CustomEvent) => {
                  const el = e.currentTarget as SyntaxInput;
                  const value = el.input?.value.trim() || "";

                  void this.updateRows(
                    {
                      id,
                      cells: [sel, value],
                    },
                    i,
                  );

                  if (value) {
                    try {
                      // Validate attribute
                      document.createElement("a").setAttribute(value, "x-test");
                    } catch {
                      el.setCustomValidity(
                        msg("Please enter a valid HTML attribute"),
                      );
                    }
                  }
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
                  @click=${() => void this.updateRows(undefined, i)}
                ></sl-icon-button>
              </sl-tooltip>
            </btrix-table-cell>
          `,
        )}
      </btrix-table-row>
    `;
  };

  private async updateRows(
    row: LinkSelectorTable["rows"][0] | undefined,
    idx: number,
  ) {
    const pre = this.rows.slice(0, idx);
    const ap = this.rows.slice(idx + 1);

    const rows = row ? [...pre, row, ...ap] : [...pre, ...ap];

    if (rows.length) {
      this.rows = rows;
    } else {
      this.rows = [
        {
          id: nanoid(),
          cells: emptyCells,
        },
      ];
    }

    await this.updateComplete;

    this.dispatchEvent(
      new CustomEvent("btrix-change", {
        detail: {
          value: this.value,
        },
      }),
    );
  }
}
