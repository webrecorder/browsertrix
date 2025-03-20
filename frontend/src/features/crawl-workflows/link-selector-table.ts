import { localized, msg } from "@lit/localize";
import clsx from "clsx";
import { html, type PropertyValues } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators.js";
import { when } from "lit/directives/when.js";

import { BtrixElement } from "@/classes/BtrixElement";
import type { SyntaxInput } from "@/components/ui/syntax-input";
import type { TableRow } from "@/components/ui/table/table-row";
import type { SeedConfig } from "@/types/crawler";
import { tw } from "@/utils/tailwind";

const SELECTOR_DELIMITER = "->" as const;
const emptyRow = ["", ""];

const selName = "selector" as const;
const attrName = "attribute" as const;

@customElement("btrix-link-selector-table")
@localized()
export class LinkSelectorTable extends BtrixElement {
  @property({ type: Array })
  selectors: SeedConfig["selectLinks"] = [];

  @property({ type: Boolean })
  editable = false;

  @state()
  private values: string[][] = [];

  @queryAll("btrix-table-row")
  private readonly rows!: NodeListOf<TableRow>;

  public get value(): SeedConfig["selectLinks"] {
    return this.values
      .filter((cells) => cells[0] && cells[1])
      .map((cells) => cells.join(SELECTOR_DELIMITER));
  }

  protected willUpdate(changedProperties: PropertyValues): void {
    if (changedProperties.has("selectors")) {
      this.values = this.selectors.map((str) => str.split(SELECTOR_DELIMITER));
    }
  }

  render() {
    return html`
      <btrix-table
        class="relative h-full w-full grid-cols-[1fr_1fr_min-content] rounded border"
      >
        <btrix-table-head
          class=${clsx(
            tw`rounded-t-[0.1875rem] border-b bg-slate-50`,
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
          ${this.values.map(this.row)}
        </btrix-table-body>
      </btrix-table>

      ${when(
        this.editable,
        () => html`
          <sl-button
            class="mt-1 w-full"
            @click=${() => this.updateRows(emptyRow, this.values.length)}
          >
            <sl-icon slot="prefix" name="plus-lg"></sl-icon>
            <span class="text-neutral-600">${msg("Add More")}</span>
          </sl-button>
        `,
      )}
    `;
  }

  private readonly row = (cells: string[], i: number) => {
    const [sel, attr] = cells;

    return html`
      <btrix-table-row class=${i > 0 ? "border-t" : ""}>
        <btrix-table-cell>
          ${when(
            this.editable,
            () => html`
              <btrix-syntax-input
                class=${clsx(selName, tw`flex-1`)}
                value=${sel}
                language="css"
                placeholder="button.custom-link"
                @sl-input=${async (e: CustomEvent) => {
                  const el = e.currentTarget as SyntaxInput;

                  await el.input?.updateComplete;
                }}
                @sl-change=${(e: CustomEvent) => {
                  const el = e.currentTarget as SyntaxInput;
                  const value = el.input?.value || "";

                  try {
                    // Validate selector
                    document.createDocumentFragment().querySelector(value);

                    this.updateRows([value, attr], i);
                  } catch {
                    el.setCustomValidity(
                      msg("Please enter a valid CSS selector"),
                    );
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
        <btrix-table-cell class="border-l">
          ${when(
            this.editable,
            () => html`
              <btrix-syntax-input
                class=${clsx(attrName, tw`flex-1`)}
                value=${attr}
                language="css"
                placeholder="data-href"
                @sl-input=${async (e: CustomEvent) => {
                  const el = e.currentTarget as SyntaxInput;

                  await el.input?.updateComplete;
                }}
                @sl-change=${(e: CustomEvent) => {
                  const el = e.currentTarget as SyntaxInput;
                  const value = el.input?.value || "";

                  try {
                    // Validate attribute
                    document.createElement("a").setAttribute(value, "x-test");

                    this.updateRows([sel, value], i);
                  } catch {
                    el.setCustomValidity(
                      msg("Please enter a valid HTML attribute"),
                    );
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
              <sl-icon-button
                label=${msg("Remove exclusion")}
                class="text-base hover:text-danger"
                name="trash3"
                @click=${() => this.updateRows(undefined, i)}
              ></sl-icon-button>
            </btrix-table-cell>
          `,
        )}
      </btrix-table-row>
    `;
  };

  private updateRows(
    row: LinkSelectorTable["values"][0] | undefined,
    idx: number,
  ) {
    const pre = this.values.slice(0, idx);
    const ap = this.values.slice(idx + 1);

    const rows = row ? [...pre, row, ...ap] : [...pre, ...ap];

    if (rows.length) {
      this.values = rows;
    } else {
      this.values = [emptyRow];
    }
  }
}
